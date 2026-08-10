import { useEffect, useRef } from "react";
import { opacityAt } from "./videoOpacity";

const VIDEO_SOURCE =
  "https://d8j0ntlcm91z4.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/hf_20260328_115001_bcdaa3b4-03de-47e7-ad63-ae3e392c32d4.mp4";

export function LoopingBackgroundVideo() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const animationFrameRef = useRef<number>();
  const restartTimerRef = useRef<number>();
  const fadingOutRef = useRef(false);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    const cancelFade = (): void => {
      if (animationFrameRef.current !== undefined) cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = undefined;
    };

    const fadeTo = (target: number, duration: number): void => {
      cancelFade();
      const start = Number.parseFloat(video.style.opacity || "0");
      const startedAt = performance.now();

      const frame = (now: number): void => {
        const elapsed = now - startedAt;
        video.style.opacity = String(opacityAt(start, target, elapsed, duration));
        if (elapsed < duration) animationFrameRef.current = requestAnimationFrame(frame);
        else animationFrameRef.current = undefined;
      };

      animationFrameRef.current = requestAnimationFrame(frame);
    };

    const handleLoadedData = (): void => {
      if (reducedMotion) {
        video.style.opacity = "1";
        video.pause();
        return;
      }
      fadingOutRef.current = false;
      fadeTo(1, 500);
    };

    const handleTimeUpdate = (): void => {
      if (!Number.isFinite(video.duration) || fadingOutRef.current) return;
      if (video.duration - video.currentTime <= 0.55) {
        fadingOutRef.current = true;
        fadeTo(0, 500);
      }
    };

    const handleEnded = (): void => {
      cancelFade();
      video.style.opacity = "0";
      restartTimerRef.current = window.setTimeout(() => {
        video.currentTime = 0;
        fadingOutRef.current = false;
        void video.play().then(() => fadeTo(1, 500)).catch((error: unknown) => {
          console.error("Handy hero video could not restart.", error);
        });
      }, 100);
    };

    video.addEventListener("loadeddata", handleLoadedData);
    video.addEventListener("timeupdate", handleTimeUpdate);
    video.addEventListener("ended", handleEnded);

    if (video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) handleLoadedData();

    return () => {
      cancelFade();
      if (restartTimerRef.current !== undefined) window.clearTimeout(restartTimerRef.current);
      video.removeEventListener("loadeddata", handleLoadedData);
      video.removeEventListener("timeupdate", handleTimeUpdate);
      video.removeEventListener("ended", handleEnded);
    };
  }, []);

  return (
    <video
      ref={videoRef}
      src={VIDEO_SOURCE}
      autoPlay
      muted
      playsInline
      preload="auto"
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 h-full w-full translate-y-[17%] object-cover"
      style={{ opacity: 0 }}
    />
  );
}
