
# Project Blueprint

## Overview

This project is a multiproduct break-even calculator designed as a premium consulting tool. It allows users to input product data, fixed costs, and variable taxes to calculate the break-even point for their business. The application features a clean, modern interface with a dark theme and provides scenario analysis to compare "Real" vs. "Optimistic" business outlooks.

## Features and Design

### Implemented Features:
- **Calculations Engine:** A robust TypeScript module to calculate the multiproduct break-even point.
- **Interactive Dashboard:** A Next.js and Tailwind CSS-based UI for data input and results visualization.
- **Scenario Comparison:** A toggle to switch between "Real" and "Optimistic" scenarios, with the latter applying a price multiplier.

### Style and Design:
- **Theme:** Dark theme with a clean, professional aesthetic.
- **Typography:** Clean, sans-serif fonts for readability.
- **Layout:** Responsive layout with rounded corners and ample spacing.
- **Components:** Modern UI components for forms, buttons, and data display.

## Current Plan

The current plan is to build the initial version of the application as described above. The steps are:
1.  Create the directory structure for the application.
2.  Implement the `types.ts` file to define data structures.
3.  Implement the `calculations.ts` file for the break-even logic.
4.  Set up the Next.js App Router and Tailwind CSS.
5.  Create the main dashboard page with the form and results display.
6.  Create the `ScenarioToggle.tsx` component for scenario analysis.
