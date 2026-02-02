/**
 * Side Panel UI - main interface for recording and editing targets
 */

import type {
  RecorderState,
  RecordedTarget,
  RecordedStep,
  SidePanelToBackgroundMessage,
  BackgroundToSidePanelMessage,
} from '../types/messages.js'

// State
let state: RecorderState = {
  recordingState: 'idle',
  currentTargetId: null,
  targets: [],
}

let selectedTargetId: string | null = null
let editingStepId: string | null = null

// DOM Elements
const elements = {
  // Recording controls
  recordingStatus: document.getElementById('recordingStatus')!,
  btnStartRecording: document.getElementById('btnStartRecording') as HTMLButtonElement,
  btnPauseRecording: document.getElementById('btnPauseRecording') as HTMLButtonElement,
  btnStopRecording: document.getElementById('btnStopRecording') as HTMLButtonElement,

  // Tabs
  tabs: document.querySelectorAll('.tab') as NodeListOf<HTMLButtonElement>,
  targetsTab: document.getElementById('targetsTab')!,
  editorTab: document.getElementById('editorTab')!,

  // Targets list
  targetsList: document.getElementById('targetsList')!,
  btnNewTarget: document.getElementById('btnNewTarget') as HTMLButtonElement,

  // Editor
  editorEmpty: document.getElementById('editorEmpty')!,
  editorForm: document.getElementById('editorForm') as HTMLFormElement,
  targetId: document.getElementById('targetId') as HTMLInputElement,
  targetLabel: document.getElementById('targetLabel') as HTMLInputElement,
  targetDescription: document.getElementById('targetDescription') as HTMLTextAreaElement,
  targetKeywords: document.getElementById('targetKeywords') as HTMLInputElement,
  targetCategory: document.getElementById('targetCategory') as HTMLSelectElement,
  stepsList: document.getElementById('stepsList')!,
  stepCount: document.getElementById('stepCount')!,
  btnDeleteTarget: document.getElementById('btnDeleteTarget') as HTMLButtonElement,

  // Footer
  btnImport: document.getElementById('btnImport') as HTMLButtonElement,
  btnExport: document.getElementById('btnExport') as HTMLButtonElement,

  // Modals
  newTargetModal: document.getElementById('newTargetModal') as HTMLDialogElement,
  newTargetId: document.getElementById('newTargetId') as HTMLInputElement,
  newTargetLabel: document.getElementById('newTargetLabel') as HTMLInputElement,
  btnCancelNewTarget: document.getElementById('btnCancelNewTarget') as HTMLButtonElement,

  stepModal: document.getElementById('stepModal') as HTMLDialogElement,
  stepInstruction: document.getElementById('stepInstruction') as HTMLInputElement,
  stepAction: document.getElementById('stepAction') as HTMLSelectElement,
  stepInputGroup: document.getElementById('stepInputGroup')!,
  stepInput: document.getElementById('stepInput') as HTMLInputElement,
  stepUrlContains: document.getElementById('stepUrlContains') as HTMLInputElement,
  stepVisible: document.getElementById('stepVisible') as HTMLInputElement,
  selectorPreview: document.getElementById('selectorPreview')!,
  btnCancelStep: document.getElementById('btnCancelStep') as HTMLButtonElement,

  importModal: document.getElementById('importModal') as HTMLDialogElement,
  importJson: document.getElementById('importJson') as HTMLTextAreaElement,
  btnCancelImport: document.getElementById('btnCancelImport') as HTMLButtonElement,
}

/**
 * Send message to background service worker
 */
async function sendMessage(
  message: SidePanelToBackgroundMessage
): Promise<BackgroundToSidePanelMessage | undefined> {
  return chrome.runtime.sendMessage(message)
}

/**
 * Update UI based on current state
 */
function updateUI(): void {
  updateRecordingStatus()
  updateTargetsList()
  updateEditor()
}

/**
 * Update recording status indicator
 */
function updateRecordingStatus(): void {
  const statusDot = elements.recordingStatus.querySelector('.status-dot')!
  const statusText = elements.recordingStatus.querySelector('.status-text')!

  statusDot.className = `status-dot ${state.recordingState}`

  switch (state.recordingState) {
    case 'idle':
      statusText.textContent = 'Ready to record'
      elements.btnStartRecording.disabled = false
      elements.btnPauseRecording.disabled = true
      elements.btnStopRecording.disabled = true
      break
    case 'recording':
      const target = state.targets.find((t) => t.id === state.currentTargetId)
      statusText.textContent = `Recording: ${target?.label || 'Unknown'}`
      elements.btnStartRecording.disabled = true
      elements.btnPauseRecording.disabled = false
      elements.btnStopRecording.disabled = false
      break
    case 'paused':
      statusText.textContent = 'Paused'
      elements.btnStartRecording.disabled = true
      elements.btnPauseRecording.disabled = false
      elements.btnStopRecording.disabled = false
      break
  }
}

/**
 * Update targets list
 */
function updateTargetsList(): void {
  if (state.targets.length === 0) {
    elements.targetsList.innerHTML =
      '<li class="empty-state">No targets yet. Click "+ New" to create one.</li>'
    return
  }

  elements.targetsList.innerHTML = state.targets
    .map((target) => {
      const isActive = target.id === selectedTargetId
      const isRecording = target.id === state.currentTargetId && state.recordingState === 'recording'

      return `
        <li class="target-item ${isActive ? 'active' : ''} ${isRecording ? 'recording' : ''}"
            data-id="${target.id}">
          <input type="checkbox" class="target-checkbox" checked>
          <div class="target-info">
            <div class="target-label">${escapeHtml(target.label)}</div>
            <div class="target-meta">${target.category} · ${target.steps.length} steps</div>
          </div>
          <span class="target-steps-count">${target.steps.length}</span>
        </li>
      `
    })
    .join('')

  // Add click handlers
  elements.targetsList.querySelectorAll('.target-item').forEach((item) => {
    item.addEventListener('click', (e) => {
      if ((e.target as Element).classList.contains('target-checkbox')) return
      selectTarget(item.getAttribute('data-id')!)
    })
  })
}

/**
 * Update editor form
 */
function updateEditor(): void {
  if (!selectedTargetId) {
    elements.editorEmpty.style.display = 'flex'
    elements.editorForm.style.display = 'none'
    return
  }

  const target = state.targets.find((t) => t.id === selectedTargetId)
  if (!target) {
    selectedTargetId = null
    updateEditor()
    return
  }

  elements.editorEmpty.style.display = 'none'
  elements.editorForm.style.display = 'flex'

  elements.targetId.value = target.id
  elements.targetLabel.value = target.label
  elements.targetDescription.value = target.description
  elements.targetKeywords.value = target.keywords.join(', ')
  elements.targetCategory.value = target.category

  updateStepsList(target)
}

/**
 * Update steps list in editor
 */
function updateStepsList(target: RecordedTarget): void {
  elements.stepCount.textContent = `${target.steps.length} steps`

  if (target.steps.length === 0) {
    elements.stepsList.innerHTML = '<li class="empty-state">No steps recorded yet</li>'
    return
  }

  elements.stepsList.innerHTML = target.steps
    .map(
      (step, index) => `
      <li class="step-item" data-id="${step.id}">
        <span class="step-number">${index + 1}</span>
        <div class="step-info">
          <div class="step-instruction">${escapeHtml(step.instruction)}</div>
          <div class="step-action">${step.action}${step.input ? `: "${escapeHtml(step.input.slice(0, 20))}"` : ''}</div>
        </div>
        <button class="step-delete" data-step-id="${step.id}">✕</button>
      </li>
    `
    )
    .join('')

  // Add click handlers
  elements.stepsList.querySelectorAll('.step-item').forEach((item) => {
    item.addEventListener('click', (e) => {
      if ((e.target as Element).classList.contains('step-delete')) {
        e.stopPropagation()
        deleteStep(item.getAttribute('data-id')!)
        return
      }
      editStep(item.getAttribute('data-id')!)
    })
  })
}

/**
 * Select a target for editing
 */
function selectTarget(id: string): void {
  selectedTargetId = id
  updateUI()
  switchTab('editor')
}

/**
 * Switch between tabs
 */
function switchTab(tabName: string): void {
  elements.tabs.forEach((tab) => {
    tab.classList.toggle('active', tab.dataset.tab === tabName)
  })
  elements.targetsTab.classList.toggle('active', tabName === 'targets')
  elements.editorTab.classList.toggle('active', tabName === 'editor')
}

/**
 * Create a new target
 */
async function createTarget(id: string, label: string): Promise<void> {
  await sendMessage({
    type: 'CREATE_TARGET',
    payload: { id, label },
  })
  selectedTargetId = id
}

/**
 * Start recording for selected target
 */
async function startRecording(): Promise<void> {
  if (!selectedTargetId) {
    elements.newTargetModal.showModal()
    return
  }

  await sendMessage({
    type: 'START_RECORDING',
    payload: { targetId: selectedTargetId },
  })
}

/**
 * Edit a step
 */
function editStep(stepId: string): void {
  if (!selectedTargetId) return

  const target = state.targets.find((t) => t.id === selectedTargetId)
  const step = target?.steps.find((s) => s.id === stepId)
  if (!step) return

  editingStepId = stepId

  elements.stepInstruction.value = step.instruction
  elements.stepAction.value = step.action
  elements.stepInput.value = step.input || ''
  elements.stepUrlContains.value = step.successCondition?.urlContains || ''
  elements.stepVisible.value = step.successCondition?.visible || ''

  // Show/hide input field based on action
  elements.stepInputGroup.style.display =
    step.action === 'type' || step.action === 'select' ? 'flex' : 'none'

  // Show selector preview
  elements.selectorPreview.textContent = JSON.stringify(step.selector, null, 2)

  elements.stepModal.showModal()
}

/**
 * Save step changes
 */
async function saveStep(): Promise<void> {
  if (!selectedTargetId || !editingStepId) return

  await sendMessage({
    type: 'UPDATE_STEP',
    payload: {
      targetId: selectedTargetId,
      stepId: editingStepId,
      updates: {
        instruction: elements.stepInstruction.value,
        action: elements.stepAction.value as RecordedStep['action'],
        input: elements.stepInput.value || undefined,
        successCondition: {
          urlContains: elements.stepUrlContains.value || undefined,
          visible: elements.stepVisible.value || undefined,
        },
      },
    },
  })

  editingStepId = null
}

/**
 * Delete a step
 */
async function deleteStep(stepId: string): Promise<void> {
  if (!selectedTargetId) return

  if (confirm('Delete this step?')) {
    await sendMessage({
      type: 'DELETE_STEP',
      payload: { targetId: selectedTargetId, stepId },
    })
  }
}

/**
 * Save target changes
 */
async function saveTarget(): Promise<void> {
  if (!selectedTargetId) return

  await sendMessage({
    type: 'UPDATE_TARGET',
    payload: {
      id: selectedTargetId,
      updates: {
        id: elements.targetId.value,
        label: elements.targetLabel.value,
        description: elements.targetDescription.value,
        keywords: elements.targetKeywords.value.split(',').map((k) => k.trim()).filter(Boolean),
        category: elements.targetCategory.value,
      },
    },
  })
}

/**
 * Delete selected target
 */
async function deleteTarget(): Promise<void> {
  if (!selectedTargetId) return

  if (confirm('Delete this target and all its steps?')) {
    await sendMessage({
      type: 'DELETE_TARGET',
      payload: { id: selectedTargetId },
    })
    selectedTargetId = null
  }
}

/**
 * Export manifest
 */
async function exportManifest(): Promise<void> {
  const response = await sendMessage({ type: 'EXPORT_MANIFEST' })
  if (response?.type === 'EXPORT_READY') {
    // Download as file
    const blob = new Blob([response.payload.json], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'guide.manifest.json'
    a.click()
    URL.revokeObjectURL(url)
  }
}

/**
 * Import manifest
 */
async function importManifest(): Promise<void> {
  const json = elements.importJson.value
  if (!json) return

  const response = await sendMessage({
    type: 'IMPORT_MANIFEST',
    payload: { json },
  })

  if (response?.type === 'ERROR') {
    alert(response.payload.message)
  } else {
    elements.importModal.close()
    elements.importJson.value = ''
  }
}

/**
 * Escape HTML
 */
function escapeHtml(text: string): string {
  const div = document.createElement('div')
  div.textContent = text
  return div.innerHTML
}

/**
 * Initialize event listeners
 */
function initEventListeners(): void {
  // Recording controls
  elements.btnStartRecording.addEventListener('click', startRecording)
  elements.btnPauseRecording.addEventListener('click', () => {
    if (state.recordingState === 'paused') {
      sendMessage({ type: 'RESUME_RECORDING' })
    } else {
      sendMessage({ type: 'PAUSE_RECORDING' })
    }
  })
  elements.btnStopRecording.addEventListener('click', () => sendMessage({ type: 'STOP_RECORDING' }))

  // Tabs
  elements.tabs.forEach((tab) => {
    tab.addEventListener('click', () => switchTab(tab.dataset.tab!))
  })

  // New target
  elements.btnNewTarget.addEventListener('click', () => elements.newTargetModal.showModal())
  elements.btnCancelNewTarget.addEventListener('click', () => elements.newTargetModal.close())
  elements.newTargetModal.querySelector('form')!.addEventListener('submit', async (e) => {
    e.preventDefault()
    const id = elements.newTargetId.value
    const label = elements.newTargetLabel.value
    if (id && label) {
      await createTarget(id, label)
      elements.newTargetModal.close()
      elements.newTargetId.value = ''
      elements.newTargetLabel.value = ''
      // Auto-start recording
      await sendMessage({ type: 'START_RECORDING', payload: { targetId: id } })
      switchTab('editor')
    }
  })

  // Editor form
  elements.editorForm.addEventListener('submit', (e) => {
    e.preventDefault()
    saveTarget()
  })
  elements.btnDeleteTarget.addEventListener('click', deleteTarget)

  // Step modal
  elements.stepAction.addEventListener('change', () => {
    const action = elements.stepAction.value
    elements.stepInputGroup.style.display = action === 'type' || action === 'select' ? 'flex' : 'none'
  })
  elements.btnCancelStep.addEventListener('click', () => {
    elements.stepModal.close()
    editingStepId = null
  })
  elements.stepModal.querySelector('form')!.addEventListener('submit', async (e) => {
    e.preventDefault()
    await saveStep()
    elements.stepModal.close()
  })

  // Import/Export
  elements.btnExport.addEventListener('click', exportManifest)
  elements.btnImport.addEventListener('click', () => elements.importModal.showModal())
  elements.btnCancelImport.addEventListener('click', () => elements.importModal.close())
  elements.importModal.querySelector('form')!.addEventListener('submit', (e) => {
    e.preventDefault()
    importManifest()
  })
}

/**
 * Handle messages from background
 */
function handleMessage(message: BackgroundToSidePanelMessage): void {
  switch (message.type) {
    case 'STATE_UPDATED':
      state = message.payload
      updateUI()
      break
    case 'STEP_RECORDED':
      // State will be updated via STATE_UPDATED, but we could add animation here
      break
    case 'ERROR':
      alert(message.payload.message)
      break
  }
}

/**
 * Initialize
 */
async function init(): Promise<void> {
  // Get initial state
  const response = await sendMessage({ type: 'GET_STATE' })
  if (response?.type === 'STATE_UPDATED') {
    state = response.payload
  }

  // Listen for updates
  chrome.runtime.onMessage.addListener((message) => {
    handleMessage(message as BackgroundToSidePanelMessage)
  })

  initEventListeners()
  updateUI()
}

init()
