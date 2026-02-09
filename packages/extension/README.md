# @clippi/extension

Chrome extension for manually recording user flows and generating Clippi manifest files.

## Features

- **Side Panel UI**: Record and edit flows side-by-side with your app
- **Smart Selector Extraction**: Automatically generates multiple selector strategies (testId, aria, css, text)
- **Multi-target Support**: Record multiple flows in a single session
- **Manifest Export**: Export directly to `guide.manifest.json` format

## Installation (Development)

1. Build the extension:
   ```bash
   cd packages/extension
   pnpm install
   pnpm build
   ```

2. Load in Chrome:
   - Go to `chrome://extensions`
   - Enable "Developer mode"
   - Click "Load unpacked"
   - Select the `dist` folder

## Usage

1. Click the Clippi extension icon to open the Side Panel
2. Click "+ New" to create a new target
3. Enter an ID and label for the target
4. Click "Create & Start Recording"
5. Interact with your app - clicks and inputs are captured automatically
6. Edit step instructions in the Editor tab
7. Click "Export Manifest" to download the JSON file

## Architecture

```
src/
├── manifest.json           # Chrome Manifest V3
├── background/
│   └── service-worker.ts   # State management, message routing
├── content/
│   └── content-script.ts   # DOM event capture, visual feedback
├── sidepanel/
│   ├── sidepanel.html      # Side Panel UI
│   ├── sidepanel.css       # Styles
│   └── sidepanel.ts        # UI logic
├── recorder/
│   ├── selector-extractor.ts   # Generate selectors from elements
│   └── manifest-builder.ts     # Convert to manifest format
└── types/
    ├── messages.ts         # Message type definitions
    └── manifest.ts         # Manifest type definitions
```

## Selector Priority

The extension generates selectors in priority order (most stable first):

1. **testId**: `data-testid`, `data-test-id`, `data-test`
2. **aria**: `aria-label`
3. **css**: ID, unique attributes, class-based, or structural
4. **text**: Visible text content (fragile fallback)

## Icons

Replace the placeholder icons in `src/icons/` with your own:
- `icon-16.png` (16x16)
- `icon-48.png` (48x48)
- `icon-128.png` (128x128)
