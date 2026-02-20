"use client";

import * as React from "react";
import { motion, useReducedMotion } from "framer-motion";

import { cn } from "@/lib/utils";

type MotionRevealProps = {
  children: React.ReactNode;
  className?: string;
  delay?: number;
  y?: number;
};

/**
 * Small reusable entrance animation for server-rendered pages.
 * Keeps motion subtle and respects reduced-motion preferences.
 */
export function MotionReveal({
  children,
  className,
  delay = 0,
  y = 10,
}: MotionRevealProps) {
  const reduceMotion = useReducedMotion();

  if (reduceMotion) {
    return <div className={className}>{children}</div>;
  }

  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, ease: "easeOut", delay }}
    >
      {children}
    </motion.div>
  );
}

type MotionStaggerListProps = {
  children: React.ReactNode;
  className?: string;
  delayChildren?: number;
};

export function MotionStaggerList({
  children,
  className,
  delayChildren = 0.05,
}: MotionStaggerListProps) {
  const reduceMotion = useReducedMotion();

  if (reduceMotion) {
    return <ul className={className}>{children}</ul>;
  }

  return (
    <motion.ul
      className={className}
      initial="hidden"
      animate="show"
      variants={{
        hidden: {},
        show: {
          transition: {
            staggerChildren: delayChildren,
          },
        },
      }}
    >
      {children}
    </motion.ul>
  );
}

type MotionStaggerItemProps = {
  children: React.ReactNode;
  className?: string;
};

export function MotionStaggerItem({ children, className }: MotionStaggerItemProps) {
  const reduceMotion = useReducedMotion();

  if (reduceMotion) {
    return <li className={className}>{children}</li>;
  }

  return (
    <motion.li
      className={cn(className)}
      variants={{
        hidden: { opacity: 0, y: 8 },
        show: { opacity: 1, y: 0 },
      }}
      transition={{ duration: 0.35, ease: "easeOut" }}
    >
      {children}
    </motion.li>
  );
}
