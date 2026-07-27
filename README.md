# 3D Building Floor Navigation Map

An interactive 3D Building Floor model and pathfinding application built with React, Three.js, and Vite. This application allows users to view a 3D floor map of a building (consisting of Ground, First, and Second floors) and compute the shortest walking path between different rooms, staircases, and entrances using Dijkstra's algorithm.

## Features

- **3D Interactive Building Model**: Built with Three.js, enabling rendering of rooms, floors, staircases, and paths in a 3D space.
- **Multi-Floor Support**: View Ground, First, and Second floors, showing their rooms (lecture halls, labs, wait rooms, libraries, HOD rooms, toilets) and entrances.
- **Intelligent Pathfinding**: Uses Dijkstra's algorithm to calculate the shortest path between any two locations across different floors.
- **Vertical Navigation**: Correctly routes paths through designated staircases (Staircase 1 and Staircase 2) when moving between floors.
- **Step-by-step Directions**: Generates clear, text-based navigation instructions along with the computed 3D visual path.

## Tech Stack

- **Frontend Framework**: [React](https://react.dev/)
- **3D Graphics**: [Three.js](https://threejs.org/)
- **Bundler & Dev Server**: [Vite](https://vitejs.dev/)

## Getting Started

### Prerequisites

Make sure you have [Node.js](https://nodejs.org/) installed (v18.x or higher recommended).

### Installation

1. Clone or download this project.
2. Open a terminal in the project directory.
3. Install dependencies:
   ```bash
   npm install
   ```

### Running the Project

To start the development server:
```bash
npm run dev
```

To build for production:
```bash
npm run build
```

To preview the production build:
```bash
npm run preview
```

## Project Structure

- [main.jsx](file:///d:/codeing/map-1/src/main.jsx): Application entry point.
- [App.jsx](file:///d:/codeing/map-1/src/App.jsx): Main React application component.
- [BuildingModel3D.jsx](file:///d:/codeing/map-1/src/BuildingModel3D.jsx): The core component implementing the Three.js 3D building visualization, floor navigation UI, room layout definition, pathfinding graph creation, and Dijkstra path calculation.
- [index.html](file:///d:/codeing/map-1/index.html): The HTML wrapper.
- [vite.config.js](file:///d:/codeing/map-1/vite.config.js): Vite configuration.
