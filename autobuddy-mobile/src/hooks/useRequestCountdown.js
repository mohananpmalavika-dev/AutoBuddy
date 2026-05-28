import { useCallback, useEffect, useRef, useState } from 'react';

const DEFAULT_COUNTDOWN_SECONDS = 60; // Default 60-second ride request timeout

export function useRequestCountdown({
  rideId,
  initialSeconds = DEFAULT_COUNTDOWN_SECONDS,
  onExpire,
  autoStart = true,
}) {
  const [secondsRemaining, setSecondsRemaining] = useState(initialSeconds);
  const [isRunning, setIsRunning] = useState(autoStart);
  const [isExpired, setIsExpired] = useState(false);
  const countdownRef = useRef(null);
  const startTimeRef = useRef(null);
  const lastRideIdRef = useRef(rideId);

  const start = useCallback(() => {
    if (isRunning) return;
    setIsRunning(true);
    setSecondsRemaining(initialSeconds);
    setIsExpired(false);
    startTimeRef.current = Date.now();
  }, [isRunning, initialSeconds]);

  const pause = useCallback(() => {
    setIsRunning(false);
    if (countdownRef.current) {
      clearInterval(countdownRef.current);
      countdownRef.current = null;
    }
  }, []);

  const resume = useCallback(() => {
    setIsRunning(true);
  }, []);

  const reset = useCallback(() => {
    pause();
    setSecondsRemaining(initialSeconds);
    setIsExpired(false);
  }, [initialSeconds, pause]);

  const abort = useCallback(() => {
    pause();
    setIsExpired(true);
    if (typeof onExpire === 'function') {
      onExpire('aborted');
    }
  }, [onExpire, pause]);

  useEffect(() => {
    const timer = setTimeout(() => {
      const rideChanged = lastRideIdRef.current !== rideId;
      if (rideChanged) {
        lastRideIdRef.current = rideId;
        setSecondsRemaining(initialSeconds);
        setIsExpired(false);
      }
      setIsRunning(Boolean(autoStart && rideId));
    }, 0);
    return () => clearTimeout(timer);
  }, [autoStart, initialSeconds, rideId]);

  // Main countdown logic
  useEffect(() => {
    if (!isRunning || isExpired) {
      if (countdownRef.current) {
        clearInterval(countdownRef.current);
        countdownRef.current = null;
      }
      return;
    }

    countdownRef.current = setInterval(() => {
      setSecondsRemaining((prev) => {
        const next = prev - 1;

        if (next <= 0) {
          setIsRunning(false);
          setIsExpired(true);
          if (countdownRef.current) {
            clearInterval(countdownRef.current);
            countdownRef.current = null;
          }
          if (typeof onExpire === 'function') {
            onExpire('timeout');
          }
          return 0;
        }

        return next;
      });
    }, 1000);

    return () => {
      if (countdownRef.current) {
        clearInterval(countdownRef.current);
      }
    };
  }, [isRunning, isExpired, onExpire]);

  // Return formatted time string
  const getFormattedTime = useCallback(() => {
    const minutes = Math.floor(secondsRemaining / 60);
    const seconds = secondsRemaining % 60;
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  }, [secondsRemaining]);

  // Get percentage for progress bar
  const getPercentage = useCallback(() => {
    return (secondsRemaining / initialSeconds) * 100;
  }, [secondsRemaining, initialSeconds]);

  // Check if low time (less than 10 seconds)
  const isLowTime = secondsRemaining <= 10 && secondsRemaining > 0;

  return {
    secondsRemaining,
    isRunning,
    isExpired,
    isLowTime,
    formattedTime: getFormattedTime(),
    percentage: getPercentage(),
    start,
    pause,
    resume,
    reset,
    abort,
  };
}
