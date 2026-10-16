import { useState, useEffect, useRef, useCallback } from 'react';

/**
 * useInactivityTimeout
 * Enforces HIPAA Technical Safeguard 45 CFR § 164.312(a)(2)(iii) (Automatic Logoff).
 * Monitors user interaction and triggers a warning modal followed by automatic session termination.
 *
 * @param {Object} options
 * @param {number} [options.timeoutMs=900000] - Total inactivity duration before auto-logout (default: 15 minutes)
 * @param {number} [options.warningMs=60000] - Duration before timeout to display warning modal (default: 60 seconds)
 * @param {Function} options.onTimeout - Callback invoked upon inactivity expiration
 * @param {boolean} [options.enabled=true] - Whether the timer is currently active
 */
export function useInactivityTimeout({
  timeoutMs = 15 * 60 * 1000,
  warningMs = 60 * 1000,
  onTimeout,
  enabled = true
}) {
  const [showWarning, setShowWarning] = useState(false);
  const [remainingSeconds, setRemainingSeconds] = useState(Math.round(warningMs / 1000));
  
  const lastActivityRef = useRef(0);
  const timerRef = useRef(null);
  const countdownIntervalRef = useRef(null);

  const resetTimer = useCallback(() => {
    lastActivityRef.current = Date.now();
    if (showWarning) {
      setShowWarning(false);
      setRemainingSeconds(Math.round(warningMs / 1000));
    }
    if (countdownIntervalRef.current) {
      clearInterval(countdownIntervalRef.current);
      countdownIntervalRef.current = null;
    }
  }, [showWarning, warningMs]);

  useEffect(() => {
    if (!enabled) {
      if (timerRef.current) clearInterval(timerRef.current);
      if (countdownIntervalRef.current) clearInterval(countdownIntervalRef.current);
      return;
    }

    lastActivityRef.current = Date.now();

    // Throttled event handler for user interaction
    let throttleTimeout = null;
    const handleUserActivity = () => {
      if (!throttleTimeout) {
        throttleTimeout = setTimeout(() => {
          throttleTimeout = null;
        }, 1000); // Throttle activity updates to at most once per second
        
        // Only reset if warning is NOT actively displaying, so user must deliberately click "Stay Logged In"
        if (!showWarning) {
          lastActivityRef.current = Date.now();
        }
      }
    };

    const events = ['mousedown', 'keydown', 'touchstart', 'scroll'];
    events.forEach(event => {
      window.addEventListener(event, handleUserActivity, { passive: true });
    });

    // Check timer status every second
    timerRef.current = setInterval(() => {
      const elapsed = Date.now() - lastActivityRef.current;
      const timeLeft = timeoutMs - elapsed;

      if (timeLeft <= 0) {
        // Inactivity threshold reached: Force logout
        clearInterval(timerRef.current);
        if (countdownIntervalRef.current) clearInterval(countdownIntervalRef.current);
        setShowWarning(false);
        if (onTimeout) {
          onTimeout();
        }
      } else if (timeLeft <= warningMs) {
        // Warning threshold reached: Show warning modal
        if (!showWarning) {
          setShowWarning(true);
        }
        setRemainingSeconds(Math.max(0, Math.ceil(timeLeft / 1000)));
      } else {
        if (showWarning) {
          setShowWarning(false);
        }
      }
    }, 1000);

    return () => {
      events.forEach(event => {
        window.removeEventListener(event, handleUserActivity);
      });
      if (timerRef.current) clearInterval(timerRef.current);
      if (countdownIntervalRef.current) clearInterval(countdownIntervalRef.current);
    };
  }, [enabled, timeoutMs, warningMs, onTimeout, showWarning]);

  return {
    showWarning,
    remainingSeconds,
    resetTimer
  };
}
