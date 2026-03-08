use enigo::{
    Button, Coordinate,
    Direction::{Press, Release},
    Enigo, Key, Keyboard, Mouse, Settings,
};

/// Inject an absolute mouse move to the given screen coordinates.
#[tauri::command]
pub fn inject_mouse_move(x: i32, y: i32) -> Result<(), String> {
    let mut enigo = Enigo::new(&Settings::default()).map_err(|e| e.to_string())?;
    enigo
        .move_mouse(x, y, Coordinate::Abs)
        .map_err(|e| e.to_string())
}

/// Inject a mouse button press or release.
/// `button`: "left" | "right" | "middle"
/// `down`: true = press, false = release
#[tauri::command]
pub fn inject_mouse_button(button: &str, down: bool) -> Result<(), String> {
    let mut enigo = Enigo::new(&Settings::default()).map_err(|e| e.to_string())?;
    let btn = match button {
        "right" => Button::Right,
        "middle" => Button::Middle,
        _ => Button::Left,
    };
    let dir = if down { Press } else { Release };
    enigo.button(btn, dir).map_err(|e| e.to_string())
}

/// Inject a keyboard key press or release.
/// `key_name`: web KeyboardEvent.key values (e.g. "a", "Enter", "Backspace", "Tab", etc.)
/// `down`: true = press, false = release
#[tauri::command]
pub fn inject_key(key_name: &str, down: bool) -> Result<(), String> {
    let mut enigo = Enigo::new(&Settings::default()).map_err(|e| e.to_string())?;
    let dir = if down { Press } else { Release };

    // Map common web KeyboardEvent.key names to enigo Keys
    match key_name {
        "Enter" => enigo.key(Key::Return, dir),
        "Backspace" => enigo.key(Key::Backspace, dir),
        "Delete" => enigo.key(Key::Delete, dir),
        "Tab" => enigo.key(Key::Tab, dir),
        "Escape" => enigo.key(Key::Escape, dir),
        "ArrowLeft" => enigo.key(Key::LeftArrow, dir),
        "ArrowRight" => enigo.key(Key::RightArrow, dir),
        "ArrowUp" => enigo.key(Key::UpArrow, dir),
        "ArrowDown" => enigo.key(Key::DownArrow, dir),
        "Home" => enigo.key(Key::Home, dir),
        "End" => enigo.key(Key::End, dir),
        "PageUp" => enigo.key(Key::PageUp, dir),
        "PageDown" => enigo.key(Key::PageDown, dir),
        "F1" => enigo.key(Key::F1, dir),
        "F2" => enigo.key(Key::F2, dir),
        "F3" => enigo.key(Key::F3, dir),
        "F4" => enigo.key(Key::F4, dir),
        "F5" => enigo.key(Key::F5, dir),
        "F6" => enigo.key(Key::F6, dir),
        "F7" => enigo.key(Key::F7, dir),
        "F8" => enigo.key(Key::F8, dir),
        "F9" => enigo.key(Key::F9, dir),
        "F10" => enigo.key(Key::F10, dir),
        "F11" => enigo.key(Key::F11, dir),
        "F12" => enigo.key(Key::F12, dir),
        "Meta" | "Control" => enigo.key(Key::Meta, dir),
        "Alt" => enigo.key(Key::Alt, dir),
        "Shift" => enigo.key(Key::Shift, dir),
        "CapsLock" => enigo.key(Key::CapsLock, dir),
        " " | "Space" => enigo.key(Key::Space, dir),
        // Single printable character — use Unicode key
        s if s.chars().count() == 1 => {
            let ch = s.chars().next().unwrap();
            enigo.key(Key::Unicode(ch), dir)
        }
        // Unknown key — silently ignore
        _ => return Ok(()),
    }
    .map_err(|e| e.to_string())
}
