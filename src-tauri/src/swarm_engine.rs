//! Swarm orchestration engine.
//!
//! Evaluates workflow step dependencies and prepares the next ready agents
//! when a step completes. Called from the frontend via Tauri commands
//! after a `pty_exit` event is processed.

use rusqlite::Connection;
use std::collections::HashMap;
use std::sync::Mutex;
use tauri::State;

use crate::types::{SwarmAgent, WorkflowStep};

type DbState = Mutex<Connection>;

/// Resolve template variables in a CLI command template.
fn resolve_template(template: &str, vars: &HashMap<&str, &str>) -> String {
    let mut result = template.to_string();
    for (key, value) in vars {
        result = result.replace(&format!("{{{{{}}}}}", key), value);
    }
    result
}

/// Find workflow steps that are ready to execute:
/// - status == "pending"
/// - all dependencies are in "completed" status
fn evaluate_ready_steps(conn: &Connection, run_id: &str) -> Result<Vec<WorkflowStep>, String> {
    let mut stmt = conn
        .prepare(
            "SELECT id, swarm_run_id, step_order, preset_id, prompt_override, depends_on_json, status, agent_id
             FROM workflow_steps WHERE swarm_run_id = ?1 ORDER BY step_order ASC",
        )
        .map_err(|e| e.to_string())?;

    let all_steps: Vec<WorkflowStep> = stmt
        .query_map(rusqlite::params![run_id], |row| {
            Ok(WorkflowStep {
                id: row.get(0)?,
                swarm_run_id: row.get(1)?,
                step_order: row.get(2)?,
                preset_id: row.get(3)?,
                prompt_override: row.get(4)?,
                depends_on_json: row.get(5)?,
                status: row.get(6)?,
                agent_id: row.get(7)?,
            })
        })
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;

    // Build a status map
    let status_map: HashMap<String, String> = all_steps
        .iter()
        .map(|s| (s.id.clone(), s.status.clone()))
        .collect();

    let mut ready = Vec::new();
    for step in &all_steps {
        if step.status != "pending" {
            continue;
        }
        let deps: Vec<String> = serde_json::from_str(&step.depends_on_json).unwrap_or_default();
        let all_deps_done = deps
            .iter()
            .all(|dep_id| status_map.get(dep_id).map(|s| s == "completed").unwrap_or(false));
        if all_deps_done {
            ready.push(step.clone());
        }
    }

    Ok(ready)
}

/// Advance a workflow run: spawn agents for ready steps, or complete the run
/// if all steps are done.
///
/// Called from the frontend after processing a `pty_exit` event for a swarm agent.
#[tauri::command]
pub fn swarm_advance_run(
    run_id: String,
    completed_agent_pane_id: String,
    exit_code: Option<i32>,
    output_summary: Option<String>,
    db: State<'_, DbState>,
) -> Result<Vec<SwarmAgent>, String> {
    let conn = db.lock().map_err(|e| e.to_string())?;

    // 1. Find the step that the completed agent belongs to and update it
    let agent_status = if exit_code.unwrap_or(0) == 0 { "completed" } else { "failed" };

    // Update the agent record
    conn.execute(
        "UPDATE swarm_agents SET status = ?1, exit_code = ?2, output_summary = ?3, completed_at = datetime('now')
         WHERE pane_id = ?4 AND swarm_run_id = ?5",
        rusqlite::params![agent_status, exit_code, output_summary, completed_agent_pane_id, run_id],
    )
    .map_err(|e| e.to_string())?;

    // Update the workflow step status
    conn.execute(
        "UPDATE workflow_steps SET status = ?1
         WHERE swarm_run_id = ?2 AND agent_id = (
             SELECT id FROM swarm_agents WHERE pane_id = ?3 AND swarm_run_id = ?2
         )",
        rusqlite::params![agent_status, run_id, completed_agent_pane_id],
    )
    .map_err(|e| e.to_string())?;

    // 2. Check if all steps are terminal
    let total: i64 = conn
        .prepare("SELECT COUNT(*) FROM workflow_steps WHERE swarm_run_id = ?1")
        .map_err(|e| e.to_string())?
        .query_row(rusqlite::params![run_id], |row| row.get(0))
        .map_err(|e| e.to_string())?;

    let terminal: i64 = conn
        .prepare("SELECT COUNT(*) FROM workflow_steps WHERE swarm_run_id = ?1 AND status IN ('completed', 'failed', 'skipped')")
        .map_err(|e| e.to_string())?
        .query_row(rusqlite::params![run_id], |row| row.get(0))
        .map_err(|e| e.to_string())?;

    if total > 0 && terminal == total {
        // All steps done — mark run as completed or failed
        let any_failed: i64 = conn
            .prepare("SELECT COUNT(*) FROM workflow_steps WHERE swarm_run_id = ?1 AND status = 'failed'")
            .map_err(|e| e.to_string())?
            .query_row(rusqlite::params![run_id], |row| row.get(0))
            .map_err(|e| e.to_string())?;

        let final_status = if any_failed > 0 { "Failed" } else { "Completed" };
        conn.execute(
            "UPDATE swarm_runs SET status = ?1, current_role = NULL, updated_at = datetime('now') WHERE id = ?2",
            rusqlite::params![final_status, run_id],
        )
        .map_err(|e| e.to_string())?;

        return Ok(vec![]);
    }

    // 3. Find ready steps and spawn agents for them
    let ready_steps = evaluate_ready_steps(&conn, &run_id)?;
    if ready_steps.is_empty() {
        return Ok(vec![]);
    }

    // Get run's prompt for template resolution
    let run_prompt: Option<String> = conn
        .prepare("SELECT prompt FROM swarm_runs WHERE id = ?1")
        .map_err(|e| e.to_string())?
        .query_row(rusqlite::params![run_id], |row| row.get(0))
        .map_err(|e| e.to_string())?;

    let run_cwd: String = conn
        .prepare("SELECT project_path FROM swarm_runs WHERE id = ?1")
        .map_err(|e| e.to_string())?
        .query_row(rusqlite::params![run_id], |row| row.get(0))
        .map_err(|e| e.to_string())?;

    // Get previous step's output for context chaining
    let prev_output = output_summary.as_deref().unwrap_or("");

    let mut next_agents = Vec::new();

    for step in &ready_steps {
        // Load preset
        let preset_template: String = conn
            .prepare("SELECT cli_command_template FROM agent_presets WHERE id = ?1")
            .map_err(|e| e.to_string())?
            .query_row(rusqlite::params![step.preset_id], |row| row.get(0))
            .map_err(|e| format!("Preset {} not found: {}", step.preset_id, e))?;

        let preset_role: String = conn
            .prepare("SELECT role FROM agent_presets WHERE id = ?1")
            .map_err(|e| e.to_string())?
            .query_row(rusqlite::params![step.preset_id], |row| row.get(0))
            .map_err(|e| e.to_string())?;

        // Resolve template
        let prompt_str = step
            .prompt_override
            .as_deref()
            .unwrap_or(run_prompt.as_deref().unwrap_or(""));

        let mut vars = HashMap::new();
        vars.insert("prompt", prompt_str);
        vars.insert("cwd", run_cwd.as_str());
        vars.insert("previous_output", prev_output);
        vars.insert("task.title", prompt_str);
        vars.insert("task.description", "");

        let resolved_command = resolve_template(&preset_template, &vars);

        // Generate agent pane_id
        let agent_id = uuid::Uuid::new_v4().to_string();
        let pane_id = format!(
            "swarm-{}-{}-{}",
            &run_id[..8.min(run_id.len())],
            preset_role.to_lowercase(),
            step.step_order
        );

        // Create agent record
        conn.execute(
            "INSERT INTO swarm_agents (id, swarm_run_id, preset_id, pane_id, role, command, status, started_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, 'running', datetime('now'))",
            rusqlite::params![agent_id, run_id, step.preset_id, pane_id, preset_role, resolved_command],
        )
        .map_err(|e| e.to_string())?;

        // Link agent to step
        conn.execute(
            "UPDATE workflow_steps SET status = 'running', agent_id = ?1 WHERE id = ?2",
            rusqlite::params![agent_id, step.id],
        )
        .map_err(|e| e.to_string())?;

        // Update run status
        conn.execute(
            "UPDATE swarm_runs SET status = 'Running', current_role = ?1, updated_at = datetime('now') WHERE id = ?2",
            rusqlite::params![preset_role, run_id],
        )
        .map_err(|e| e.to_string())?;

        let agent = SwarmAgent {
            id: agent_id,
            swarm_run_id: run_id.clone(),
            preset_id: Some(step.preset_id.clone()),
            pane_id: pane_id.clone(),
            role: preset_role.clone(),
            command: resolved_command.clone(),
            status: "running".to_string(),
            exit_code: None,
            output_summary: None,
            started_at: None,
            completed_at: None,
        };

        next_agents.push(agent);
    }

    Ok(next_agents)
}
