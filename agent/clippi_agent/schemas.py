"""
Schemas for Clippi Agent inputs and outputs.

These models define the structure for:
- Agent configuration (inputs)
- Manifest generation (outputs)
- Step recording during exploration
"""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field


# =============================================================================
# Input Schemas
# =============================================================================


class AgentTask(BaseModel):
    """A single task for the agent to explore and document."""

    description: str = Field(
        ...,
        description="Natural language description of the task, e.g. 'export data to CSV'",
    )
    id: str | None = Field(
        default=None,
        description="Optional ID for the task. If not provided, will be generated from description.",
    )
    category: str | None = Field(
        default=None,
        description="Optional category for grouping, e.g. 'data', 'settings', 'account'",
    )
    keywords: list[str] = Field(
        default_factory=list,
        description="Additional keywords for matching user queries",
    )


class AgentConfig(BaseModel):
    """Configuration for the Clippi agent."""

    # Required
    url: str = Field(
        ...,
        description="Base URL of the application to explore",
    )
    tasks: list[AgentTask] = Field(
        ...,
        description="List of tasks to explore and document",
    )

    # LLM Configuration
    provider: Literal["gemini", "openai", "anthropic"] = Field(
        default="gemini",
        description="LLM provider to use",
    )
    model: str = Field(
        default="gemini-2.0-flash",
        description="Model name/ID to use",
    )

    # Browser Configuration
    headless: bool = Field(
        default=True,
        description="Run browser in headless mode",
    )
    timeout_ms: int = Field(
        default=30000,
        description="Timeout for page operations in milliseconds",
    )
    viewport_width: int = Field(
        default=1280,
        description="Browser viewport width",
    )
    viewport_height: int = Field(
        default=720,
        description="Browser viewport height",
    )

    # Output Configuration
    output_path: str = Field(
        default="guide.manifest.json",
        description="Path to write the generated manifest",
    )

    # Context (optional)
    docs_context: str | None = Field(
        default=None,
        description="Optional documentation text to provide context to the agent",
    )


# =============================================================================
# Output Schemas (Manifest)
# =============================================================================


class SelectorStrategy(BaseModel):
    """A selector strategy for finding an element."""

    type: Literal["testId", "aria", "css", "text"] = Field(
        ...,
        description="Type of selector",
    )
    value: str = Field(
        ...,
        description="Selector value",
    )
    tag: str | None = Field(
        default=None,
        description="HTML tag filter (only for 'text' type)",
    )


class Selector(BaseModel):
    """Element selector with fallback strategies."""

    strategies: list[SelectorStrategy] = Field(
        ...,
        min_length=1,
        description="Selector strategies in priority order",
    )


class SuccessCondition(BaseModel):
    """Condition to verify step completion."""

    url_contains: str | None = None
    url_matches: str | None = None
    visible: str | None = None
    exists: str | None = None
    click: bool | None = None


class PathStep(BaseModel):
    """A single step in a multi-step path."""

    selector: Selector = Field(
        ...,
        description="Element selector for this step",
    )
    instruction: str = Field(
        ...,
        description="Human-readable instruction for this step",
    )
    action: Literal["click", "type", "select", "clear"] = Field(
        default="click",
        description="Action to perform on the element",
    )
    input: str | None = Field(
        default=None,
        description="Input value for 'type' or 'select' actions",
    )
    success_condition: SuccessCondition | None = Field(
        default=None,
        description="Condition to verify step completion",
    )
    final: bool = Field(
        default=False,
        description="Whether this is the final step in the path",
    )


class OnBlocked(BaseModel):
    """Action when a target is blocked by conditions."""

    message: str = Field(
        ...,
        description="Message to show the user",
    )
    suggest: str | None = Field(
        default=None,
        description="ID of another target to suggest",
    )


class ManifestTarget(BaseModel):
    """A single guidable target in the manifest."""

    id: str = Field(
        ...,
        description="Unique identifier for this target",
    )
    selector: Selector = Field(
        ...,
        description="Element selector",
    )
    label: str = Field(
        ...,
        description="Human-readable label",
    )
    description: str = Field(
        ...,
        description="Description of what this target does",
    )
    keywords: list[str] = Field(
        default_factory=list,
        description="Keywords for matching user queries",
    )
    category: str | None = Field(
        default=None,
        description="Category for grouping",
    )
    path: list[PathStep] | None = Field(
        default=None,
        description="Multi-step path to reach this target",
    )
    conditions: str | None = Field(
        default=None,
        description="Conditions DSL for access control",
    )
    on_blocked: OnBlocked | None = Field(
        default=None,
        description="Action when blocked",
    )


class ManifestMeta(BaseModel):
    """Manifest metadata."""

    app_name: str = Field(
        default="MyApp",
        description="Application name",
    )
    generated_at: str = Field(
        ...,
        description="ISO timestamp of generation",
    )
    generator: str = Field(
        default="clippi-agent/0.1.0",
        description="Generator identifier",
    )
    version: str | None = Field(
        default=None,
        description="Manifest version",
    )


class ManifestDefaults(BaseModel):
    """Default values for the manifest."""

    timeout_ms: int = Field(
        default=10000,
        description="Default timeout for operations",
    )


class Manifest(BaseModel):
    """Complete Clippi manifest."""

    schema_: str = Field(
        default="https://clippi.net/schema/manifest.v1.json",
        alias="$schema",
    )
    meta: ManifestMeta
    defaults: ManifestDefaults = Field(default_factory=ManifestDefaults)
    targets: list[ManifestTarget] = Field(default_factory=list)


# =============================================================================
# Recording Schemas (internal use during exploration)
# =============================================================================


class RecordedAction(BaseModel):
    """An action recorded during exploration."""

    action_type: Literal["click", "type", "select", "navigate", "scroll"]
    element_tag: str | None = None
    element_text: str | None = None
    element_attributes: dict[str, str] = Field(default_factory=dict)
    input_value: str | None = None
    url_before: str
    url_after: str
    timestamp: float
    screenshot_path: str | None = None


class RecordedFlow(BaseModel):
    """A complete recorded flow for a task."""

    task: AgentTask
    actions: list[RecordedAction] = Field(default_factory=list)
    success: bool = False
    error: str | None = None
    duration_ms: float = 0
