"use client";

import React, { useRef } from "react";
import { useScroll, useTransform, motion, MotionValue, useReducedMotion } from "framer-motion";

export const ContainerScroll = ({
  titleComponent,
  children,
}: {
  titleComponent: string | React.ReactNode;
  children: React.ReactNode;
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  // "start start" -> "end start": progress is driven by how far the container itself
  // has scrolled past the top of the viewport, not by container-height-vs-viewport-height
  // geometry. That keeps progress ~0 at rest even when this section sits at the very top
  // of the page (our case) or when its height is shorter than the viewport (mobile) —
  // the default ["start start", "end end"] pairing breaks in exactly that situation,
  // pinning the transform near its end value before the user has scrolled at all.
  const { scrollYProgress } = useScroll({
    target: containerRef,
    offset: ["start start", "end start"],
  });
  const [isMobile, setIsMobile] = React.useState(false);
  const prefersReducedMotion = useReducedMotion();

  React.useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth <= 768);
    };
    checkMobile();
    window.addEventListener("resize", checkMobile);
    return () => {
      window.removeEventListener("resize", checkMobile);
    };
  }, []);

  const scaleDimensions = (): [number, number] => {
    return isMobile ? [0.7, 0.9] : [1.05, 1];
  };

  // prefers-reduced-motion: skip the scroll-linked 3D tilt entirely and settle
  // on the resting state (flat, full scale) — required per the ui-ux-pro-max
  // accessibility guideline on scroll-jacking / parallax motion sickness.
  const rotateRange = prefersReducedMotion ? [0, 0] : [20, 0];
  const rotate = useTransform(scrollYProgress, [0, 1], rotateRange);
  const scale = useTransform(scrollYProgress, [0, 1], prefersReducedMotion ? [1, 1] : scaleDimensions());
  const translate = useTransform(scrollYProgress, [0, 1], prefersReducedMotion ? [0, 0] : [0, -100]);

  return (
    <div
      className="flex h-[44rem] items-center justify-center relative p-2 md:h-[62rem] md:p-20"
      ref={containerRef}
    >
      <div
        className="py-10 md:py-40 w-full relative"
        style={{
          perspective: "1000px",
        }}
      >
        <Header translate={translate} titleComponent={titleComponent} />
        <Card rotate={rotate} translate={translate} scale={scale}>
          {children}
        </Card>
      </div>
    </div>
  );
};

export const Header = ({ translate, titleComponent }: any) => {
  return (
    <motion.div
      style={{
        translateY: translate,
      }}
      className="div max-w-5xl mx-auto text-center"
    >
      {titleComponent}
    </motion.div>
  );
};

export const Card = ({
  rotate,
  scale,
  children,
}: {
  rotate: MotionValue<number>;
  scale: MotionValue<number>;
  translate: MotionValue<number>;
  children: React.ReactNode;
}) => {
  return (
    <motion.div
      style={{ rotateX: rotate, scale }}
      className="glass-surface-elevated mx-auto -mt-12 w-full max-w-4xl p-6 sm:p-8 md:p-10"
    >
      {children}
    </motion.div>
  );
};
