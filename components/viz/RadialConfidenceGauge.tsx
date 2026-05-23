"use client";

import { useEffect, useRef, useState } from "react";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { Sparkles, Brain, CheckCircle2, ShieldCheck, RefreshCw } from "lucide-react";

if (typeof window !== "undefined") {
  gsap.registerPlugin(ScrollTrigger);
}

interface RadialConfidenceGaugeProps {
  confidence?: number; // 0 to 1 scaling, default is 0.84 (84%)
  loading?: boolean;
  className?: string;
}

export function RadialConfidenceGauge({
  confidence = 0.84,
  loading = false,
  className = "",
}: RadialConfidenceGaugeProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const circleRef = useRef<SVGCircleElement>(null);
  const [animatedValue, setAnimatedValue] = useState(0);
  const [isInteracting, setIsInteracting] = useState(false);

  // SVG dimensions & calculations for a clean radial arc
  const radius = 70;
  const strokeWidth = 12;
  const circumference = 2 * Math.PI * radius; // Approx 439.82
  
  // We'll map the progress so a full circle represents 100%
  // To make it an open arc gauge, we'll configure strokeDasharray to match a gorgeous peak percentage.
  const targetOffset = circumference - confidence * circumference;

  useEffect(() => {
    if (loading || !circleRef.current) return;

    // Reset indicator on re-runs
    gsap.set(circleRef.current, { strokeDashoffset: circumference });
    setAnimatedValue(0);

    const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    // Trigger precise sweep animation once the gauge moves into the viewport
    const trigger = ScrollTrigger.create({
      trigger: containerRef.current,
      start: "top bottom-=80", // Fires when container's top reaches 80px above viewport bottom
      onEnter: () => {
        if (prefersReducedMotion) {
          gsap.set(circleRef.current, { strokeDashoffset: targetOffset });
          setAnimatedValue(Math.round(confidence * 100));
          return;
        }

        // Animate strokeDashoffset from full circumference (0% visible) to its targetOffset
        gsap.to(circleRef.current, {
          strokeDashoffset: targetOffset,
          duration: 1.8,
          ease: "power3.out",
        });

        // Run a counter alongside it to increment the text percentage in perfect synchronicity
        const counter = { val: 0 };
        gsap.to(counter, {
          val: confidence * 100,
          duration: 1.8,
          ease: "power3.out",
          onUpdate: () => {
            setAnimatedValue(Math.round(counter.val));
          },
        });
      },
      onLeaveBack: () => {
        if (!prefersReducedMotion) {
          gsap.set(circleRef.current, { strokeDashoffset: circumference });
          setAnimatedValue(0);
        }
      },
    });

    return () => {
      trigger.kill();
    };
  }, [confidence, loading, circumference, targetOffset]);

  // Interpolate peak stroke tone dynamically from teal (0%) to warm amber (100%)
  const getProgressColor = (val: number) => {
    // Simplified color vector translation for classes
    if (val < 40) return "stroke-[#14b8a6]"; // teal
    if (val < 75) return "stroke-[#38bdf8]"; // sky
    return "stroke-[#d4b370]"; // warm amber
  };

  const getTextColor = (val: number) => {
    if (val < 40) return "text-[#14b8a6]";
    if (val < 75) return "text-[#38bdf8]";
    return "text-[#d4b370]";
  };

  const handleManualReplay = () => {
    if (isInteracting) return;
    setIsInteracting(true);

    gsap.killTweensOf(circleRef.current);

    const counterObj = { val: 0 };
    gsap.set(circleRef.current, { strokeDashoffset: circumference });
    
    gsap.to(circleRef.current, {
      strokeDashoffset: targetOffset,
      duration: 1.4,
      ease: "back.out(1.1)",
    });

    gsap.to(counterObj, {
      val: confidence * 100,
      duration: 1.4,
      ease: "power3.out",
      onUpdate: () => {
        setAnimatedValue(Math.round(counterObj.val));
      },
      onComplete: () => {
        setIsInteracting(false);
      },
    });
  };

  if (loading) {
    return (
      <div className={`p-5 rounded-2xl bg-slate-900 border border-slate-800 flex items-center justify-between gap-4 animate-pulse h-40 ${className}`}>
        <div className="space-y-2">
          <div className="h-5 w-40 bg-slate-800 rounded"></div>
          <div className="h-3 w-48 bg-slate-800 rounded"></div>
        </div>
        <div className="h-24 w-24 rounded-full bg-slate-800"></div>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      id="confidence-gauge-card"
      className={`relative p-5 sm:p-6 rounded-2xl bg-slate-900 border border-slate-800 text-slate-100 shadow-xl overflow-hidden hover:border-slate-700/60 transition-colors duration-300 ${className}`}
    >
      {/* Background decoration lines */}
      <div className="absolute top-0 right-0 h-40 w-40 bg-radial from-teal-500/5 to-transparent blur-2xl pointer-events-none" />

      <div className="flex flex-col sm:flex-row items-center justify-between gap-6 relative z-10">
        
        {/* Descriptive Metrics */}
        <div className="space-y-3 text-center sm:text-left flex-1">
          <div className="flex items-center justify-center sm:justify-start gap-2">
            <span className="text-[10px] font-mono tracking-widest text-[#d4b370] bg-[#d4b370]/10 px-2 py-0.5 rounded border border-[#d4b370]/20 uppercase flex items-center gap-1">
              <Brain className="h-3 w-3" />
              Machine Appraisal Confidence
            </span>
          </div>

          <div className="space-y-1">
            <h3 className="text-lg font-bold tracking-tight text-white flex items-center justify-center sm:justify-start gap-1.5">
              <span>Predictive Valuation Index</span>
              <button 
                onClick={handleManualReplay} 
                disabled={isInteracting}
                className="p-1 hover:bg-slate-800 rounded transition-colors text-slate-400 hover:text-white"
                title="Replay sweep transition"
              >
                <RefreshCw className={`h-3 w-3 ${isInteracting ? "animate-spin text-teal-400" : ""}`} />
              </button>
            </h3>
            <p className="text-xs text-slate-400 leading-relaxed font-sans max-w-sm">
              Our appraisal neural network cross-references actual sales with incoming commercial building permits to compute predictive reliability indexes.
            </p>
          </div>

          <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2 text-[10px] font-mono text-slate-500 pt-1">
            <span className="flex items-center gap-1 text-teal-400"><ShieldCheck className="h-3 w-3 text-teal-400" /> High Integrity</span>
            <span>•</span>
            <span className="flex items-center gap-1 text-slate-400"><CheckCircle2 className="h-3 w-3 text-emerald-400" /> 10-Fold Verified</span>
          </div>
        </div>

        {/* Custom Radial Arc SVG Area */}
        <div className="relative flex-none flex items-center justify-center">
          <svg className="transform -rotate-90 w-[160px] h-[160px]">
            {/* Background full track arc */}
            <circle
              cx="80"
              cy="80"
              r={radius}
              className="stroke-slate-800/80"
              strokeWidth={strokeWidth}
              fill="transparent"
            />
            {/* Target animated accent arc */}
            <circle
              ref={circleRef}
              cx="80"
              cy="80"
              r={radius}
              className={`${getProgressColor(animatedValue)} transition-colors duration-300`}
              strokeWidth={strokeWidth}
              fill="transparent"
              strokeLinecap="round"
              strokeDasharray={circumference}
              strokeDashoffset={circumference}
            />
          </svg>

          {/* Central numeric content overlay */}
          <div className="absolute flex flex-col items-center justify-center text-center">
            <span className={`text-3xl font-extrabold tracking-tighter ${getTextColor(animatedValue)} font-mono tabular-nums leading-none`}>
              {animatedValue}%
            </span>
            <span className="text-[9px] font-mono tracking-widest text-slate-400 uppercase mt-0.5 font-bold">
              Confidence
            </span>
          </div>
        </div>

      </div>
    </div>
  );
}
