import { useState, useEffect } from "react";

/**
 * Custom hook to track window width
 * 
 * 2025/2026 Pattern:
 * - Returns current window width
 * - Updates on window resize
 * - Cleans up event listener on unmount
 */
export function useWindowSize() {
  const [windowWidth, setWindowWidth] = useState<number>(window.innerWidth);

  useEffect(() => {
    const handleResize = () => {
      setWindowWidth(window.innerWidth);
    };

    // Add event listener
    window.addEventListener("resize", handleResize);

    // Cleanup
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  return windowWidth;
}