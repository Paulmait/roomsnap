/**
 * Asset Generator for RoomSnap AR
 * Generates properly sized square icons for iOS, Android, and Web
 *
 * Usage: node scripts/generate-assets.js
 */

const sharp = require('sharp');
const path = require('path');
const fs = require('fs');

const ASSETS_DIR = path.join(__dirname, '..', 'assets');

// RoomSnap brand colors
const PRIMARY_COLOR = '#2196F3';
const SECONDARY_COLOR = '#0D47A1';
const BACKGROUND_COLOR = '#FFFFFF';

// Icon sizes needed
const ICON_SIZES = {
  'icon.png': 1024,           // App Store / Play Store
  'adaptive-icon.png': 1024,  // Android adaptive icon foreground
  'favicon.png': 48,          // Web favicon
  'notification-icon.png': 96 // Push notification icon
};

// Splash screen size
const SPLASH_WIDTH = 1284;
const SPLASH_HEIGHT = 2778;

async function generateSVGIcon(size) {
  // Create a modern AR measurement app icon
  const padding = Math.floor(size * 0.1);
  const innerSize = size - (padding * 2);
  const centerX = size / 2;
  const centerY = size / 2;

  // Icon elements
  const cubeSize = innerSize * 0.35;
  const rulerLength = innerSize * 0.5;

  return `
    <svg width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="bgGradient" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" style="stop-color:${PRIMARY_COLOR};stop-opacity:1" />
          <stop offset="100%" style="stop-color:${SECONDARY_COLOR};stop-opacity:1" />
        </linearGradient>
        <linearGradient id="cubeGradient" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" style="stop-color:#FFFFFF;stop-opacity:0.95" />
          <stop offset="100%" style="stop-color:#E3F2FD;stop-opacity:0.9" />
        </linearGradient>
        <filter id="shadow" x="-20%" y="-20%" width="140%" height="140%">
          <feDropShadow dx="0" dy="${size * 0.02}" stdDeviation="${size * 0.03}" flood-color="#000000" flood-opacity="0.3"/>
        </filter>
      </defs>

      <!-- Background with rounded corners -->
      <rect x="0" y="0" width="${size}" height="${size}" rx="${size * 0.22}" ry="${size * 0.22}" fill="url(#bgGradient)"/>

      <!-- 3D Cube representing AR/room -->
      <g transform="translate(${centerX - cubeSize * 0.5}, ${centerY - cubeSize * 0.4})" filter="url(#shadow)">
        <!-- Cube top face -->
        <polygon
          points="${cubeSize * 0.5},0 ${cubeSize},${cubeSize * 0.25} ${cubeSize * 0.5},${cubeSize * 0.5} 0,${cubeSize * 0.25}"
          fill="#FFFFFF"
          stroke="#FFFFFF"
          stroke-width="2"
          opacity="0.95"
        />
        <!-- Cube left face -->
        <polygon
          points="0,${cubeSize * 0.25} ${cubeSize * 0.5},${cubeSize * 0.5} ${cubeSize * 0.5},${cubeSize} 0,${cubeSize * 0.75}"
          fill="#E3F2FD"
          stroke="#FFFFFF"
          stroke-width="2"
          opacity="0.9"
        />
        <!-- Cube right face -->
        <polygon
          points="${cubeSize * 0.5},${cubeSize * 0.5} ${cubeSize},${cubeSize * 0.25} ${cubeSize},${cubeSize * 0.75} ${cubeSize * 0.5},${cubeSize}"
          fill="#BBDEFB"
          stroke="#FFFFFF"
          stroke-width="2"
          opacity="0.85"
        />
      </g>

      <!-- Measurement line with markers -->
      <g transform="translate(${centerX - rulerLength * 0.5}, ${centerY + innerSize * 0.25})">
        <!-- Main measurement line -->
        <line x1="0" y1="0" x2="${rulerLength}" y2="0" stroke="#FFFFFF" stroke-width="${size * 0.025}" stroke-linecap="round"/>
        <!-- Left marker -->
        <line x1="0" y1="${-size * 0.04}" x2="0" y2="${size * 0.04}" stroke="#FFFFFF" stroke-width="${size * 0.02}" stroke-linecap="round"/>
        <!-- Right marker -->
        <line x1="${rulerLength}" y1="${-size * 0.04}" x2="${rulerLength}" y2="${size * 0.04}" stroke="#FFFFFF" stroke-width="${size * 0.02}" stroke-linecap="round"/>
        <!-- Center tick marks -->
        <line x1="${rulerLength * 0.25}" y1="${-size * 0.02}" x2="${rulerLength * 0.25}" y2="${size * 0.02}" stroke="#FFFFFF" stroke-width="${size * 0.01}" stroke-linecap="round" opacity="0.7"/>
        <line x1="${rulerLength * 0.5}" y1="${-size * 0.025}" x2="${rulerLength * 0.5}" y2="${size * 0.025}" stroke="#FFFFFF" stroke-width="${size * 0.015}" stroke-linecap="round" opacity="0.8"/>
        <line x1="${rulerLength * 0.75}" y1="${-size * 0.02}" x2="${rulerLength * 0.75}" y2="${size * 0.02}" stroke="#FFFFFF" stroke-width="${size * 0.01}" stroke-linecap="round" opacity="0.7"/>
      </g>

      <!-- AR corner brackets -->
      <g stroke="#FFFFFF" stroke-width="${size * 0.02}" fill="none" opacity="0.6">
        <!-- Top left -->
        <path d="M ${padding + size * 0.08} ${padding + size * 0.03} L ${padding + size * 0.03} ${padding + size * 0.03} L ${padding + size * 0.03} ${padding + size * 0.08}"/>
        <!-- Top right -->
        <path d="M ${size - padding - size * 0.08} ${padding + size * 0.03} L ${size - padding - size * 0.03} ${padding + size * 0.03} L ${size - padding - size * 0.03} ${padding + size * 0.08}"/>
        <!-- Bottom left -->
        <path d="M ${padding + size * 0.03} ${size - padding - size * 0.08} L ${padding + size * 0.03} ${size - padding - size * 0.03} L ${padding + size * 0.08} ${size - padding - size * 0.03}"/>
        <!-- Bottom right -->
        <path d="M ${size - padding - size * 0.03} ${size - padding - size * 0.08} L ${size - padding - size * 0.03} ${size - padding - size * 0.03} L ${size - padding - size * 0.08} ${size - padding - size * 0.03}"/>
      </g>
    </svg>
  `;
}

async function generateSplashSVG() {
  const iconSize = 400;
  const centerX = SPLASH_WIDTH / 2;
  const centerY = SPLASH_HEIGHT / 2 - 100;

  return `
    <svg width="${SPLASH_WIDTH}" height="${SPLASH_HEIGHT}" xmlns="http://www.w3.org/2000/svg">
      <rect width="100%" height="100%" fill="${BACKGROUND_COLOR}"/>

      <!-- Centered icon -->
      <g transform="translate(${centerX - iconSize/2}, ${centerY - iconSize/2})">
        ${await generateSVGIcon(iconSize).then(svg => {
          // Extract the inner content without the outer svg tag
          return svg.replace(/<svg[^>]*>/, '').replace(/<\/svg>/, '');
        })}
      </g>

      <!-- App name -->
      <text x="${centerX}" y="${centerY + iconSize/2 + 80}"
            font-family="system-ui, -apple-system, sans-serif"
            font-size="64"
            font-weight="bold"
            fill="${PRIMARY_COLOR}"
            text-anchor="middle">
        RoomSnap AR
      </text>

      <!-- Tagline -->
      <text x="${centerX}" y="${centerY + iconSize/2 + 140}"
            font-family="system-ui, -apple-system, sans-serif"
            font-size="32"
            fill="#666666"
            text-anchor="middle">
        Measure. Design. Transform.
      </text>
    </svg>
  `;
}

async function generateIcon(name, size) {
  console.log(`Generating ${name} (${size}x${size})...`);

  const svg = await generateSVGIcon(size);
  const outputPath = path.join(ASSETS_DIR, name);

  await sharp(Buffer.from(svg))
    .resize(size, size)
    .png({ quality: 100 })
    .toFile(outputPath);

  console.log(`  Created: ${outputPath}`);
}

async function generateSplash() {
  console.log(`Generating splash.png (${SPLASH_WIDTH}x${SPLASH_HEIGHT})...`);

  const svg = await generateSplashSVG();
  const outputPath = path.join(ASSETS_DIR, 'splash.png');

  await sharp(Buffer.from(svg))
    .resize(SPLASH_WIDTH, SPLASH_HEIGHT)
    .png({ quality: 100 })
    .toFile(outputPath);

  console.log(`  Created: ${outputPath}`);
}

async function main() {
  console.log('');
  console.log('========================================');
  console.log('  RoomSnap AR Asset Generator');
  console.log('========================================');
  console.log('');

  // Ensure assets directory exists
  if (!fs.existsSync(ASSETS_DIR)) {
    fs.mkdirSync(ASSETS_DIR, { recursive: true });
  }

  // Generate all icon sizes
  for (const [name, size] of Object.entries(ICON_SIZES)) {
    await generateIcon(name, size);
  }

  // Generate splash screen
  await generateSplash();

  console.log('');
  console.log('========================================');
  console.log('  All assets generated successfully!');
  console.log('========================================');
  console.log('');
  console.log('Generated files:');
  Object.keys(ICON_SIZES).forEach(name => {
    console.log(`  - assets/${name}`);
  });
  console.log('  - assets/splash.png');
  console.log('');
}

main().catch(console.error);
