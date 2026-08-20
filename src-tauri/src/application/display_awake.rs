#[derive(Default)]
pub struct DisplayAwakeRequest {
    #[cfg(target_os = "windows")]
    handle: Option<isize>,
    active: bool,
}

impl DisplayAwakeRequest {
    pub fn set_enabled(&mut self, enabled: bool) -> Result<(), String> {
        if enabled == self.active {
            return Ok(());
        }
        if enabled {
            self.acquire()?;
            self.active = true;
        } else {
            self.release()?;
            self.active = false;
        }
        Ok(())
    }

    #[cfg(target_os = "windows")]
    fn acquire(&mut self) -> Result<(), String> {
        use windows::Win32::System::Power::{
            PowerCreateRequest, PowerRequestDisplayRequired, PowerSetRequest,
        };
        use windows::Win32::System::Threading::{
            POWER_REQUEST_CONTEXT_SIMPLE_STRING, REASON_CONTEXT, REASON_CONTEXT_0,
        };
        use windows::core::PWSTR;

        let mut reason: Vec<u16> = "Comic Explorer fullscreen viewing\0"
            .encode_utf16()
            .collect();
        let context = REASON_CONTEXT {
            Version: 0,
            Flags: POWER_REQUEST_CONTEXT_SIMPLE_STRING,
            Reason: REASON_CONTEXT_0 {
                SimpleReasonString: PWSTR(reason.as_mut_ptr()),
            },
        };
        // SAFETY: the context and its UTF-16 reason remain valid for the duration of the call.
        let handle = unsafe { PowerCreateRequest(&context) }
            .map_err(|error| format!("display awake request could not be created: {error}"))?;
        // SAFETY: handle was returned by PowerCreateRequest and remains owned here.
        if let Err(error) = unsafe { PowerSetRequest(handle, PowerRequestDisplayRequired) } {
            // SAFETY: closing our newly created handle releases any partial request state.
            let _ = unsafe { windows::Win32::Foundation::CloseHandle(handle) };
            return Err(format!(
                "display awake request could not be enabled: {error}"
            ));
        }
        self.handle = Some(handle.0 as isize);
        Ok(())
    }

    #[cfg(not(target_os = "windows"))]
    fn acquire(&mut self) -> Result<(), String> {
        Err("display awake requests are supported only on Windows".into())
    }

    #[cfg(target_os = "windows")]
    fn release(&mut self) -> Result<(), String> {
        use windows::Win32::Foundation::{CloseHandle, HANDLE};
        use windows::Win32::System::Power::{PowerClearRequest, PowerRequestDisplayRequired};

        let Some(raw) = self.handle else {
            return Ok(());
        };
        let handle = HANDLE(raw as *mut core::ffi::c_void);
        // SAFETY: the handle is the still-owned result of PowerCreateRequest.
        unsafe { PowerClearRequest(handle, PowerRequestDisplayRequired) }
            .map_err(|error| format!("display awake request could not be cleared: {error}"))?;
        // SAFETY: the request has been cleared and this is its final owned handle.
        unsafe { CloseHandle(handle) }
            .map_err(|error| format!("display awake handle could not be closed: {error}"))?;
        self.handle = None;
        Ok(())
    }

    #[cfg(not(target_os = "windows"))]
    fn release(&mut self) -> Result<(), String> {
        Ok(())
    }
}

impl Drop for DisplayAwakeRequest {
    fn drop(&mut self) {
        let _ = self.set_enabled(false);
    }
}

#[cfg(all(test, target_os = "windows"))]
mod tests {
    use super::DisplayAwakeRequest;

    #[test]
    fn req_ley_p2_011_display_request_is_idempotent_and_released() {
        let mut request = DisplayAwakeRequest::default();
        request.set_enabled(true).expect("enable display request");
        request.set_enabled(true).expect("repeat enable");
        assert!(request.active);
        assert!(request.handle.is_some());
        request.set_enabled(false).expect("disable display request");
        request.set_enabled(false).expect("repeat disable");
        assert!(!request.active);
        assert!(request.handle.is_none());
    }
}
