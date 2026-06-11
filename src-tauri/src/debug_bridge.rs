//! Dev-only automation bridge.
//!
//! Listens on 127.0.0.1:4446 (debug builds only) and evaluates POSTed
//! JavaScript in the main webview, returning the stringified result. Exists
//! because no working WebDriver host is available for WKWebView on macOS.
//!
//! POST /eval  — body is raw JS, evaluated as an async function body.
//! GET  /ping  — liveness check.

use tauri::AppHandle;
#[cfg(debug_assertions)]
use std::collections::HashMap;
#[cfg(debug_assertions)]
use std::io::{Read, Write};
#[cfg(debug_assertions)]
use std::net::TcpListener;
#[cfg(debug_assertions)]
use std::sync::{Condvar, Mutex};
#[cfg(debug_assertions)]
use tauri::Manager;

#[cfg(debug_assertions)]
pub struct DebugMailbox {
    results: Mutex<HashMap<u64, String>>,
    arrived: Condvar,
}

#[cfg(debug_assertions)]
impl Default for DebugMailbox {
    fn default() -> Self {
        Self {
            results: Mutex::new(HashMap::new()),
            arrived: Condvar::new(),
        }
    }
}

#[tauri::command]
#[allow(unused_variables)]
pub fn debug_report(id: u64, value: String, app: AppHandle) {
    #[cfg(debug_assertions)]
    if let Some(mailbox) = app.try_state::<DebugMailbox>() {
        if let Ok(mut results) = mailbox.results.lock() {
            results.insert(id, value);
            mailbox.arrived.notify_all();
        }
    }
}

#[cfg(debug_assertions)]
fn wait_result(mailbox: &DebugMailbox, id: u64) -> Option<String> {
    let deadline = std::time::Instant::now() + std::time::Duration::from_secs(10);
    let mut results = mailbox.results.lock().ok()?;
    loop {
        if let Some(v) = results.remove(&id) {
            return Some(v);
        }
        let now = std::time::Instant::now();
        if now >= deadline {
            return None;
        }
        let (guard, _) = mailbox
            .arrived
            .wait_timeout(results, deadline - now)
            .ok()?;
        results = guard;
    }
}

#[cfg(debug_assertions)]
fn http_response(stream: &mut std::net::TcpStream, status: &str, body: &str) {
    let _ = write!(
        stream,
        "HTTP/1.1 {status}\r\nContent-Type: text/plain\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{body}",
        body.len()
    );
}

#[cfg(not(debug_assertions))]
pub fn start(_handle: AppHandle) {}

#[cfg(debug_assertions)]
pub fn start(handle: AppHandle) {
    handle.manage(DebugMailbox::default());

    std::thread::spawn(move || {
        let listener = match TcpListener::bind("127.0.0.1:4446") {
            Ok(l) => l,
            Err(e) => {
                eprintln!("[debug_bridge] bind failed: {e}");
                return;
            }
        };
        eprintln!("[debug_bridge] listening on 127.0.0.1:4446");
        let mut next_id: u64 = 0;

        for stream in listener.incoming() {
            let mut stream = match stream {
                Ok(s) => s,
                Err(_) => continue,
            };
            let _ = stream.set_read_timeout(Some(std::time::Duration::from_secs(5)));

            // Minimal HTTP parse: headers, then Content-Length body.
            let mut raw = Vec::new();
            let mut buf = [0u8; 4096];
            let (head_end, content_length) = loop {
                match stream.read(&mut buf) {
                    Ok(0) => break (None, 0),
                    Ok(n) => {
                        raw.extend_from_slice(&buf[..n]);
                        if let Some(pos) = raw.windows(4).position(|w| w == b"\r\n\r\n") {
                            let head = String::from_utf8_lossy(&raw[..pos]).to_string();
                            let cl = head
                                .lines()
                                .find_map(|l| {
                                    let (k, v) = l.split_once(':')?;
                                    k.eq_ignore_ascii_case("content-length")
                                        .then(|| v.trim().parse::<usize>().ok())?
                                })
                                .unwrap_or(0);
                            break (Some((head, pos + 4)), cl);
                        }
                        if raw.len() > 1_048_576 {
                            break (None, 0);
                        }
                    }
                    Err(_) => break (None, 0),
                }
            };

            let Some((head, body_start)) = head_end else {
                continue;
            };

            if head.starts_with("GET /ping") {
                http_response(&mut stream, "200 OK", "pong");
                continue;
            }
            if !head.starts_with("POST /eval") {
                http_response(&mut stream, "404 Not Found", "unknown endpoint");
                continue;
            }

            while raw.len() < body_start + content_length {
                match stream.read(&mut buf) {
                    Ok(0) => break,
                    Ok(n) => raw.extend_from_slice(&buf[..n]),
                    Err(_) => break,
                }
            }
            let script = String::from_utf8_lossy(&raw[body_start..]).to_string();

            let id = next_id;
            next_id += 1;

            let Some(window) = handle.get_webview_window("main") else {
                http_response(&mut stream, "500 Internal Server Error", "no main window");
                continue;
            };

            // Evaluate as async function body; report stringified result back
            // through the debug_report command via the dev-exposed invoke hook.
            let wrapped = format!(
                r#"(async () => {{
                    let out;
                    try {{
                        out = await (async () => {{ {script} }})();
                        out = out === undefined ? "undefined" : String(out);
                    }} catch (e) {{
                        out = "ERR:" + (e && e.message ? e.message : String(e));
                    }}
                    window.__dbgInvoke("debug_report", {{ id: {id}, value: out }});
                }})();"#
            );

            if let Err(e) = window.eval(&wrapped) {
                http_response(&mut stream, "500 Internal Server Error", &format!("eval failed: {e}"));
                continue;
            }

            let mailbox = handle.state::<DebugMailbox>();
            match wait_result(&mailbox, id) {
                Some(v) => http_response(&mut stream, "200 OK", &v),
                None => http_response(&mut stream, "504 Gateway Timeout", "no result within 10s"),
            }
        }
    });
}
