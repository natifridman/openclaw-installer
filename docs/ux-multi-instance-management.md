# Multi-Instance Management UI - UX Design Proposal

**Task:** NAT-20  
**Designer:** UX Designer  
**Date:** 2026-04-09  
**Version:** 1.0

---

## Executive Summary

This document proposes comprehensive UX enhancements to the OpenClaw Installer's instance management interface to support efficient management of 20+ instances. The design introduces filtering, search, grouping, bulk operations, improved status visualization, quick actions, and instance tagging while maintaining the current clean, minimal aesthetic.

---

## 1. Current State Analysis

### 1.1 Existing Features
- ✅ Instance list with status badges (running, stopped, deploying, error)
- ✅ Individual actions: Start, Stop, Re-deploy, Delete Data, Approve Pairing
- ✅ Expandable panels: Connection Info, Command, Logs
- ✅ K8s and local mode support
- ✅ Auto-refresh (5 seconds)
- ✅ Pod status visualization for K8s instances

### 1.2 Current Limitations
- ❌ **No filtering** - Users cannot filter by status, mode, or other attributes
- ❌ **No search** - Finding specific instances requires visual scanning
- ❌ **No grouping** - All instances shown in flat list regardless of project/namespace
- ❌ **No bulk operations** - Users must start/stop instances one at a time
- ❌ **Limited status visualization** - Basic badges only
- ❌ **No quick actions menu** - All actions shown inline (cluttered)
- ❌ **Not scalable to 10+ instances** - List becomes unwieldy
- ❌ **No tagging/labeling** - No way to categorize instances

### 1.3 User Pain Points
1. **Managing many instances is tedious** - No way to operate on multiple instances
2. **Finding specific instances is slow** - No search or filtering
3. **Visual clutter with many instances** - Too many inline buttons
4. **No organizational structure** - Difficult to understand which instances belong to which projects
5. **Repetitive tasks** - Starting/stopping multiple related instances

---

## 2. User Personas & Use Cases

### Persona 1: DevOps Engineer (Power User)
**Name:** Alex  
**Goal:** Manage 20+ OpenClaw instances across multiple projects  
**Pain Points:**
- Needs to start/stop groups of instances (e.g., all dev instances)
- Wants to quickly find instances by name or project
- Needs overview of all instance statuses at a glance

**Use Cases:**
- UC-1: Start all instances for a specific project
- UC-2: Find and restart a specific agent instance
- UC-3: Stop all non-production instances to save resources
- UC-4: View all errored instances to troubleshoot

### Persona 2: Developer (Casual User)
**Name:** Jordan  
**Goal:** Manage 3-5 personal OpenClaw instances  
**Pain Points:**
- Wants simple, clear interface
- Needs to quickly access their main instance
- Occasionally needs to check logs/status

**Use Cases:**
- UC-5: Quickly open primary development instance
- UC-6: Check which instances are running
- UC-7: Stop unused instances

---

## 3. Design Proposals

### 3.1 Information Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│ Instances Tab                                                    │
├─────────────────────────────────────────────────────────────────┤
│                                                                   │
│ ┌─ Toolbar ────────────────────────────────────────────────┐    │
│ │ [🔍 Search instances...]  [Filters ▼] [Group by: None ▼] │    │
│ │ Selected: 0   [Bulk Actions ▼]                            │    │
│ └───────────────────────────────────────────────────────────┘    │
│                                                                   │
│ ┌─ Instance Groups ────────────────────────────────────────┐    │
│ │                                                            │    │
│ │ ▼ Project: openclaw-installer (3)                         │    │
│ │   ├─ [☑] user_lynx    ● running     [⚡ Actions ▼]       │    │
│ │   ├─ [ ] user_hawk    ○ stopped     [⚡ Actions ▼]       │    │
│ │   └─ [ ] user_owl     ⚠ error       [⚡ Actions ▼]       │    │
│ │                                                            │    │
│ │ ▼ Project: production (2)                                 │    │
│ │   ├─ [ ] prod_api     ● running     [⚡ Actions ▼]       │    │
│ │   └─ [ ] prod_worker  ● running     [⚡ Actions ▼]       │    │
│ │                                                            │    │
│ └────────────────────────────────────────────────────────────┘    │
│                                                                   │
│ Summary: 5 total | 3 running | 1 stopped | 1 error              │
└─────────────────────────────────────────────────────────────────┘
```

### 3.2 Feature-by-Feature Design

---

#### Feature 1: Search & Filtering

**Design:**
- **Search bar** (top-left): Real-time search across instance ID, name, prefix, agent name
- **Filter dropdown** (top-center): Multi-select filters for:
  - Status: Running, Stopped, Deploying, Error
  - Mode: Local, Kubernetes, OpenShift
  - Has Local State: Yes, No (for cluster-discovered instances)
  - Tags: User-defined tags (when implemented)

**UI Elements:**
```
┌────────────────────────────────────────────────────────┐
│ 🔍 Search instances...                 [Filters ▼]     │
│                                                         │
│ When dropdown clicked:                                 │
│ ┌─ Filters ──────────────────┐                        │
│ │ Status                      │                        │
│ │ ☑ Running (3)              │                        │
│ │ ☐ Stopped (1)              │                        │
│ │ ☐ Deploying (0)            │                        │
│ │ ☐ Error (1)                │                        │
│ │                             │                        │
│ │ Mode                        │                        │
│ │ ☑ Local (2)                │                        │
│ │ ☑ Kubernetes (2)           │                        │
│ │ ☑ OpenShift (1)            │                        │
│ │                             │                        │
│ │ [Clear All] [Apply]         │                        │
│ └─────────────────────────────┘                        │
└────────────────────────────────────────────────────────┘
```

**Behavior:**
- Search filters results in real-time (debounced 300ms)
- Filters persist during session (localStorage)
- Active filters shown as chips: `[Running ×] [Kubernetes ×]`
- Result count updates: "Showing 3 of 20 instances"

---

#### Feature 2: Grouping by Project/Namespace

**Design:**
- **Group by dropdown** (top-right): Options:
  - None (flat list)
  - Project
  - Namespace (for K8s)
  - Status
  - Mode
  - Tags (when implemented)

**UI Structure:**
```
▼ Project: openclaw-installer (3 instances)
  Summary: 2 running, 1 error
  [Collapse/Expand]
  
  ┌─────────────────────────────────────────────────┐
  │ [☑] user_lynx                                   │
  │     ● running | Local                           │
  │     http://localhost:18789                      │
  │     [⚡ Quick Actions ▼]                        │
  ├─────────────────────────────────────────────────┤
  │ [ ] user_hawk                                   │
  │     ○ stopped | Local                           │
  │     [⚡ Quick Actions ▼]                        │
  └─────────────────────────────────────────────────┘
```

**Behavior:**
- Groups collapsible/expandable
- Group headers show summary stats
- Ungrouped instances go in "Other" group
- Group state persists (localStorage)
- Can select all instances in a group with header checkbox

---

#### Feature 3: Bulk Operations

**Design:**
- **Checkbox** on each instance row for selection
- **Bulk actions dropdown** in toolbar (enabled when ≥1 selected)
- **Select all** checkbox in group headers

**Bulk Actions Menu:**
```
┌─ Bulk Actions ──────────────┐
│ Selected: 5 instances        │
├──────────────────────────────┤
│ ▶ Start Selected (2)        │
│ ◼ Stop Selected (3)         │
│ 🔄 Re-deploy Selected (K8s) │
│ ───────────────────────────  │
│ 🗑️ Delete Data (Dangerous)  │
└──────────────────────────────┘
```

**Behavior:**
- Actions disabled if not applicable (e.g., "Start" disabled if all selected are running)
- Confirmation dialog for destructive operations
- Progress indicator for bulk operations
- Results summary: "Started 5 instances (3 succeeded, 2 failed)"
- Failed operations show error messages

**Safety:**
- Delete Data requires typing "DELETE" in confirmation
- Dangerous operations show count: "Delete data for 5 instances?"

---

#### Feature 4: Improved Status Visualization

**Design:**
Enhanced status indicators with more context:

**Status Icons & Colors:**
- ● Running - Green (#27ae60)
- ○ Stopped - Gray (#95a5a6)
- ◐ Deploying - Orange (#f39c12) with spinner animation
- ⚠ Error - Red (#e74c3c) with pulse animation
- ⏸ Paused - Blue (#3498db)

**Status Details:**
```
┌─────────────────────────────────────────────┐
│ user_lynx                                   │
│ ● Running | Uptime: 2h 34m                 │
│ Local | CPU: 12% | Mem: 384MB              │
│ http://localhost:18789                      │
└─────────────────────────────────────────────┘

┌─────────────────────────────────────────────┐
│ prod_api                                    │
│ ⚠ Error | CrashLoopBackOff                 │
│ K8s | Restarts: 5 | Last: 2m ago           │
│ Back-off restarting failed container        │
└─────────────────────────────────────────────┘
```

**Health Indicators:**
- Traffic light system for instance health
- Hover tooltips with detailed metrics
- Visual progress for deploying instances

---

#### Feature 5: Quick Actions Menu

**Design:**
Replace inline action buttons with compact quick actions dropdown:

**Current (Cluttered):**
```
[Approve Pairing] [Connection Info] [Command] [Logs] [Stop] [Delete Data]
```

**Proposed (Clean):**
```
[Open Gateway] [⚡ Quick Actions ▼]
```

**Quick Actions Dropdown:**
```
┌─ Quick Actions ─────────────────────┐
│ 🌐 Open Gateway                     │
│ 🔐 Connection Info                  │
│ 💻 Show Command                     │
│ 📋 View Logs                        │
│ ───────────────────────────────────  │
│ ✓ Approve Pairing                   │
│ 🔄 Re-deploy (K8s)                  │
│ ◼ Stop Instance                     │
│ ───────────────────────────────────  │
│ 🗑️ Delete Data                      │
└─────────────────────────────────────┘
```

**Primary Actions (Always Visible):**
- **Open Gateway** button (running instances only)
- **Start** button (stopped instances only)
- Selection checkbox

**Benefits:**
- Reduces visual clutter
- More scalable for additional actions
- Better touch target sizing
- Maintains quick access to most common actions

---

#### Feature 6: Instance Tagging/Labeling

**Design:**
User-defined tags for organizing instances:

**Tag Display:**
```
┌─────────────────────────────────────────────┐
│ user_lynx                                   │
│ ● Running                                   │
│ Tags: [dev] [testing] [+]                  │
└─────────────────────────────────────────────┘
```

**Tag Management:**
- Click `[+]` to add tag
- Inline tag input with autocomplete
- Common tags: dev, staging, prod, testing, temporary
- Click tag to filter by that tag
- Click × on tag to remove

**Tag Styles:**
```css
Tag colors by category:
- Environment: Blue (#3498db) - dev, staging, prod
- Purpose: Green (#27ae60) - testing, demo, training
- Status: Orange (#f39c12) - temporary, experimental
- Custom: Gray (#95a5a6)
```

---

#### Feature 7: Optimize for 10+ Instances

**Design Optimizations:**

**7.1 Virtual Scrolling**
- Render only visible instances + buffer
- Smooth performance with 100+ instances

**7.2 Compact View Mode**
Toggle between:
- **Detailed View** (current): Shows all metadata
- **Compact View**: Shows only essentials

**Compact View:**
```
┌───────────────────────────────────────────────────┐
│ [☑] user_lynx        ● Running   [Open] [⚡]     │
│ [☑] user_hawk        ○ Stopped   [Start] [⚡]    │
│ [☑] prod_api         ● Running   [Open] [⚡]     │
└───────────────────────────────────────────────────┘
```

**7.3 Summary Dashboard**
Above instance list, show metrics:
```
┌─ Instance Overview ─────────────────────────────────┐
│ Total: 20  ● 12 Running  ○ 5 Stopped  ⚠ 3 Errors  │
│ Resources: CPU 24% | Memory 4.2GB | Uptime 99.2%   │
└─────────────────────────────────────────────────────┘
```

**7.4 Sticky Toolbar**
- Toolbar remains visible when scrolling
- Maintains access to search, filters, bulk actions

**7.5 Pagination (Optional)**
- Show 20/50/100 instances per page
- Infinite scroll option

---

### 3.3 Layout Comparison

**Before (Current):**
```
┌─────────────────────────────────────────────────────┐
│ [Notice about device pairing...]                    │
├─────────────────────────────────────────────────────┤
│ abc123                          [running]           │
│ user · lynx · http://localhost:18789                │
│ [Approve] [Connection] [Command] [Logs] [Stop] [...│
├─────────────────────────────────────────────────────┤
│ inst-2                          [stopped]           │
│ user · hawk                                         │
│ [Start] [Delete Data]                               │
├─────────────────────────────────────────────────────┤
│ ... (more instances)                                │
└─────────────────────────────────────────────────────┘
```

**After (Proposed):**
```
┌─────────────────────────────────────────────────────┐
│ 🔍 Search...  [Filters ▼] [Group: Project ▼]       │
│ Selected: 2  [Bulk Actions ▼]         [Compact ⚡] │
├─────────────────────────────────────────────────────┤
│ Summary: 5 total | 3 running | 1 stopped | 1 error │
├─────────────────────────────────────────────────────┤
│ ▼ openclaw-installer (3)        2 running, 1 error │
│   [☑] ● user_lynx          [Open Gateway] [⚡]     │
│       Tags: [dev] [testing]                         │
│   [ ] ○ user_hawk          [Start] [⚡]            │
│   [ ] ⚠ user_owl           [⚡]                    │
├─────────────────────────────────────────────────────┤
│ ▼ production (2)                         2 running │
│   [ ] ● prod_api           [Open Gateway] [⚡]     │
│   [ ] ● prod_worker        [Open Gateway] [⚡]     │
└─────────────────────────────────────────────────────┘
```

---

## 4. Component Architecture

### 4.1 Component Hierarchy

```
InstanceList (main component)
├── InstanceToolbar
│   ├── SearchBar
│   ├── FilterDropdown
│   ├── GroupBySelector
│   ├── BulkActionsMenu
│   └── ViewModeToggle
├── InstanceSummary
├── InstanceGroups (when grouped)
│   └── InstanceGroup (per group)
│       ├── GroupHeader
│       └── InstanceRow[]
└── InstanceRow (ungrouped or within groups)
    ├── InstanceCheckbox
    ├── InstanceStatus
    ├── InstanceInfo
    ├── InstanceTags
    ├── PrimaryAction (Open/Start)
    └── QuickActionsMenu
```

### 4.2 State Management

```typescript
interface InstanceListState {
  // Data
  instances: Instance[];
  
  // Filters & Search
  searchQuery: string;
  activeFilters: {
    status: string[];
    mode: string[];
    tags: string[];
  };
  
  // Grouping
  groupBy: 'none' | 'project' | 'namespace' | 'status' | 'mode' | 'tags';
  expandedGroups: Set<string>;
  
  // Selection & Bulk
  selectedInstances: Set<string>;
  bulkOperationInProgress: boolean;
  
  // UI State
  viewMode: 'detailed' | 'compact';
  sortBy: 'name' | 'status' | 'uptime';
  sortOrder: 'asc' | 'desc';
}
```

---

## 5. Implementation Recommendations

### 5.1 Phase 1: Foundation (High Priority)
**Goal:** Enable basic multi-instance management  
**Timeline:** 1-2 weeks

1. ✅ Add search bar with real-time filtering
2. ✅ Add basic status filter dropdown
3. ✅ Add instance selection checkboxes
4. ✅ Implement bulk start/stop operations
5. ✅ Add summary stats bar

**Success Criteria:**
- Users can search instances by name
- Users can filter by status
- Users can bulk start/stop instances

---

### 5.2 Phase 2: Organization (Medium Priority)
**Goal:** Improve organization and navigation  
**Timeline:** 2-3 weeks

1. ✅ Implement grouping by project/namespace
2. ✅ Add collapsible group headers
3. ✅ Replace inline buttons with quick actions menu
4. ✅ Add compact view mode
5. ✅ Improve status visualization

**Success Criteria:**
- Users can group instances by project
- Interface scales well with 20+ instances
- Quick actions reduce visual clutter

---

### 5.3 Phase 3: Advanced Features (Lower Priority)
**Goal:** Power user features and polish  
**Timeline:** 2-3 weeks

1. ✅ Implement tagging system
2. ✅ Add advanced filters (mode, tags)
3. ✅ Add virtual scrolling for 100+ instances
4. ✅ Add instance metrics (CPU, memory, uptime)
5. ✅ Add bulk re-deploy and delete operations

**Success Criteria:**
- Users can tag and organize instances
- Performance remains smooth with 100+ instances
- Power users can efficiently manage large deployments

---

## 6. Interaction Patterns

### 6.1 Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `/` | Focus search bar |
| `⌘/Ctrl + A` | Select all visible instances |
| `⌘/Ctrl + D` | Deselect all |
| `Space` | Toggle selection on focused row |
| `↑/↓` | Navigate instances |
| `Enter` | Open gateway (if running) or Start (if stopped) |
| `Delete` | Delete selected (with confirmation) |

### 6.2 Touch/Mobile Considerations

- Larger touch targets (min 44×44px)
- Swipe gestures:
  - Swipe right → Select
  - Swipe left → Quick actions menu
- Long press → Context menu
- Pull to refresh

---

## 7. Accessibility

### 7.1 WCAG Compliance

- ✅ Color contrast ≥4.5:1 for text
- ✅ All interactive elements keyboard accessible
- ✅ ARIA labels for status icons
- ✅ Screen reader friendly status announcements
- ✅ Focus indicators on all interactive elements

### 7.2 ARIA Labels

```html
<button aria-label="Start instance user_lynx">Start</button>
<div role="status" aria-live="polite">Instance user_lynx is running</div>
<input type="checkbox" aria-label="Select instance user_lynx" />
```

---

## 8. Visual Design Specifications

### 8.1 Typography

```css
--font-size-instance-name: 0.95rem;
--font-weight-instance-name: 500;
--font-size-instance-meta: 0.85rem;
--font-size-status: 0.8rem;
--font-size-group-header: 1rem;
--font-weight-group-header: 600;
```

### 8.2 Spacing

```css
--instance-row-padding: 0.75rem 1rem;
--instance-row-gap: 0.5rem;
--group-header-padding: 0.75rem 1rem;
--toolbar-padding: 0.75rem 1rem;
--action-button-spacing: 0.5rem;
```

### 8.3 Colors (Existing Palette)

```css
/* Status Colors */
--status-running: #27ae60;
--status-stopped: #95a5a6;
--status-deploying: #f39c12;
--status-error: #e74c3c;
--status-paused: #3498db;

/* Tag Colors */
--tag-environment: #3498db;
--tag-purpose: #27ae60;
--tag-status: #f39c12;
--tag-custom: #95a5a6;
```

---

## 9. Success Metrics

### 9.1 Usability Metrics

| Metric | Current | Target |
|--------|---------|--------|
| Time to find specific instance (20 instances) | ~15s | <3s |
| Time to start 5 instances | ~30s | <5s |
| Actions to filter by status | N/A | 2 clicks |
| User satisfaction (1-10) | Baseline | 8+ |

### 9.2 Performance Metrics

| Metric | Target |
|--------|--------|
| Initial render (100 instances) | <500ms |
| Search response time | <100ms |
| Bulk operation feedback | <200ms |
| Memory usage (100 instances) | <50MB |

---

## 10. Wireframe Gallery

### 10.1 Desktop - Detailed View

```
┌────────────────────────────────────────────────────────────────┐
│ OpenClaw Installer                                      v0.1.0 │
├────────────────────────────────────────────────────────────────┤
│ [Deploy]  [Instances ●]                                        │
├────────────────────────────────────────────────────────────────┤
│                                                                 │
│ ┌─ Toolbar ──────────────────────────────────────────────────┐ │
│ │ 🔍 [Search instances by name, id, prefix...]               │ │
│ │                                                             │ │
│ │ [Filters ▼] [Group by: Project ▼]  [⚡ Compact View]      │ │
│ │                                                             │ │
│ │ ☑ 3 selected  [▶ Start] [◼ Stop] [More ▼]                │ │
│ └─────────────────────────────────────────────────────────────┘ │
│                                                                 │
│ ┌─ Summary ──────────────────────────────────────────────────┐ │
│ │ Total: 12 │ ● 8 Running │ ○ 3 Stopped │ ⚠ 1 Error        │ │
│ └─────────────────────────────────────────────────────────────┘ │
│                                                                 │
│ ┌─ openclaw-installer (5 instances) ────────────── 3 running ┐ │
│ │                                                             │ │
│ │ ┌─────────────────────────────────────────────────────────┐ │ │
│ │ │ [☑] ● user_lynx                                         │ │ │
│ │ │                                                           │ │ │
│ │ │     Local | Running 2h 34m                              │ │ │
│ │ │     http://localhost:18789                              │ │ │
│ │ │     Tags: [dev] [testing] [+]                          │ │ │
│ │ │                                                           │ │ │
│ │ │     [Open Gateway]  [⚡ Quick Actions ▼]               │ │ │
│ │ └─────────────────────────────────────────────────────────┘ │ │
│ │                                                             │ │
│ │ ┌─────────────────────────────────────────────────────────┐ │ │
│ │ │ [☑] ○ user_hawk                                         │ │ │
│ │ │                                                           │ │ │
│ │ │     Local | Stopped                                     │ │ │
│ │ │     Tags: [dev]                                         │ │ │
│ │ │                                                           │ │ │
│ │ │     [Start]  [⚡ Quick Actions ▼]                      │ │ │
│ │ └─────────────────────────────────────────────────────────┘ │ │
│ │                                                             │ │
│ │ ┌─────────────────────────────────────────────────────────┐ │ │
│ │ │ [☑] ⚠ user_owl                                          │ │ │
│ │ │                                                           │ │ │
│ │ │     K8s | Error | CrashLoopBackOff                      │ │ │
│ │ │     Restarts: 5 | Last: 2m ago                          │ │ │
│ │ │     Back-off restarting failed container                │ │ │
│ │ │                                                           │ │ │
│ │ │     [⚡ Quick Actions ▼]                                │ │ │
│ │ └─────────────────────────────────────────────────────────┘ │ │
│ │                                                             │ │
│ └─────────────────────────────────────────────────────────────┘ │
│                                                                 │
│ ▶ production (2 instances) ────────────────────── 2 running    │
│                                                                 │
└────────────────────────────────────────────────────────────────┘
```

### 10.2 Desktop - Compact View

```
┌────────────────────────────────────────────────────────────────┐
│ ┌─ Toolbar ──────────────────────────────────────────────────┐ │
│ │ 🔍 [Search...]  [Filters ▼] [Group: None ▼]  [⚡ Detailed] │ │
│ │ ☑ 3 selected  [Bulk Actions ▼]                             │ │
│ └─────────────────────────────────────────────────────────────┘ │
│                                                                 │
│ ┌───────────────────────────────────────────────────────────┐   │
│ │[☑] ● user_lynx     Local   [Open Gateway] [⚡]          │   │
│ ├───────────────────────────────────────────────────────────┤   │
│ │[☑] ○ user_hawk     Local   [Start] [⚡]                 │   │
│ ├───────────────────────────────────────────────────────────┤   │
│ │[☑] ⚠ user_owl      K8s     [⚡]                         │   │
│ ├───────────────────────────────────────────────────────────┤   │
│ │[ ] ● prod_api      K8s     [Open Gateway] [⚡]          │   │
│ ├───────────────────────────────────────────────────────────┤   │
│ │[ ] ● prod_worker   K8s     [Open Gateway] [⚡]          │   │
│ ├───────────────────────────────────────────────────────────┤   │
│ │[ ] ○ test_env      Local   [Start] [⚡]                 │   │
│ └───────────────────────────────────────────────────────────┘   │
│                                                                 │
│ Showing 6 of 12 instances                                      │
└────────────────────────────────────────────────────────────────┘
```

### 10.3 Mobile View (Responsive)

```
┌─────────────────────────────┐
│ ☰ Instances                 │
├─────────────────────────────┤
│ 🔍 Search...                │
│                              │
│ [Filters ▼] [Group ▼]      │
│                              │
│ Summary: 12 total           │
│ ● 8  ○ 3  ⚠ 1             │
├─────────────────────────────┤
│ ▼ openclaw-installer (5)    │
│                              │
│ ┌───────────────────────┐   │
│ │ [☑] ● user_lynx       │   │
│ │                        │   │
│ │ Local | 2h 34m         │   │
│ │ localhost:18789        │   │
│ │                        │   │
│ │ [Open] [⚡]           │   │
│ └───────────────────────┘   │
│                              │
│ ┌───────────────────────┐   │
│ │ [ ] ○ user_hawk       │   │
│ │                        │   │
│ │ Local | Stopped        │   │
│ │                        │   │
│ │ [Start] [⚡]          │   │
│ └───────────────────────┘   │
│                              │
└─────────────────────────────┘
```

---

## 11. Edge Cases & Error Handling

### 11.1 No Instances
```
┌─────────────────────────────────┐
│ 📦 No instances found           │
│                                  │
│ Deploy from the Deploy tab,     │
│ or start a container manually   │
└─────────────────────────────────┘
```

### 11.2 Search No Results
```
┌─────────────────────────────────┐
│ 🔍 No instances match "prod_db" │
│                                  │
│ [Clear search]                  │
└─────────────────────────────────┘
```

### 11.3 Bulk Operation Failure
```
┌─────────────────────────────────┐
│ ⚠ Bulk operation completed      │
│                                  │
│ Started 3 of 5 instances        │
│                                  │
│ Failed:                         │
│ • user_owl: Already running     │
│ • prod_api: Permission denied   │
│                                  │
│ [View Details] [Dismiss]        │
└─────────────────────────────────┘
```

---

## 12. Future Enhancements (Out of Scope)

Features to consider for future iterations:

1. **Instance Templates** - Save and reuse instance configurations
2. **Scheduled Actions** - Auto-start/stop at specific times
3. **Health Monitoring** - Real-time metrics charts
4. **Alerts & Notifications** - Notify on status changes
5. **Instance Cloning** - Duplicate instance configuration
6. **Multi-tenant Support** - User-based instance filtering
7. **Batch Deployment** - Deploy multiple instances at once
8. **Resource Quotas** - Track and limit resource usage
9. **Audit Log** - Track all instance operations
10. **Export/Import** - Backup instance configurations

---

## 13. Testing Strategy

### 13.1 Unit Tests
- Search filtering logic
- Grouping algorithms
- Bulk operation handlers
- Tag management

### 13.2 Integration Tests
- Full user workflows
- API interactions
- State management

### 13.3 E2E Tests
- Search and filter scenarios
- Bulk operations
- Grouping and ungrouping
- Tag management

### 13.4 Manual Testing Scenarios
1. Manage 20+ instances
2. Search with various queries
3. Apply multiple filters
4. Bulk start/stop operations
5. Group by different attributes
6. Add/remove tags
7. Switch between view modes
8. Test on mobile devices

---

## 14. Migration Plan

### 14.1 Backward Compatibility
- Maintain existing API endpoints
- Progressive enhancement approach
- Feature flags for gradual rollout

### 14.2 User Communication
- In-app tooltips for new features
- "What's New" modal on first load
- Keyboard shortcut reference

### 14.3 Data Migration
- No database changes required
- Tags stored in instance metadata (new field)
- Filter preferences in localStorage

---

## Appendix A: API Changes

### New API Endpoints

```typescript
// Get instances with enhanced filtering
GET /api/instances?status=running&mode=local&tags=dev,testing

// Update instance tags
PATCH /api/instances/:id/tags
Body: { tags: string[] }

// Bulk operations
POST /api/instances/bulk/start
Body: { instanceIds: string[] }

POST /api/instances/bulk/stop
Body: { instanceIds: string[] }

POST /api/instances/bulk/redeploy
Body: { instanceIds: string[] }
```

### Instance Data Model Updates

```typescript
interface Instance {
  id: string;
  mode: string;
  status: string;
  config: {
    prefix: string;
    agentName: string;
    agentDisplayName: string;
  };
  startedAt: string;
  url?: string;
  containerId?: string;
  error?: string;
  statusDetail?: string;
  pods?: PodInfo[];
  hasLocalState?: boolean;
  
  // NEW FIELDS
  tags?: string[];              // User-defined tags
  projectId?: string;           // Project grouping
  namespace?: string;           // K8s namespace
  metrics?: {                   // Resource metrics
    cpu?: number;
    memory?: number;
    uptime?: number;
  };
}
```

---

## Appendix B: Style Guide Additions

```css
/* Instance List Toolbar */
.instance-toolbar {
  display: flex;
  gap: 0.75rem;
  padding: 0.75rem 1rem;
  background: var(--bg-secondary);
  border-bottom: 1px solid var(--border);
  position: sticky;
  top: 0;
  z-index: 10;
}

/* Search Bar */
.instance-search {
  flex: 1;
  max-width: 400px;
  padding: 0.5rem 0.75rem;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  font-size: 0.9rem;
}

/* Status Indicators */
.status-indicator {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  font-size: 0.8rem;
  font-weight: 500;
}

.status-indicator.running { color: var(--status-running); }
.status-indicator.stopped { color: var(--status-stopped); }
.status-indicator.deploying { color: var(--status-deploying); }
.status-indicator.error { color: var(--status-error); }

/* Tags */
.instance-tag {
  display: inline-block;
  padding: 0.2rem 0.5rem;
  background: var(--tag-custom);
  color: #fff;
  border-radius: var(--radius-sm);
  font-size: 0.75rem;
  font-weight: 500;
  cursor: pointer;
}

.instance-tag:hover {
  opacity: 0.8;
}

/* Group Headers */
.instance-group-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.75rem 1rem;
  background: var(--bg-secondary);
  border-bottom: 1px solid var(--border);
  font-weight: 600;
  cursor: pointer;
  user-select: none;
}

.instance-group-header:hover {
  background: var(--bg-hover);
}

/* Compact View */
.instance-row.compact {
  display: flex;
  align-items: center;
  gap: 1rem;
  padding: 0.5rem 1rem;
}
```

---

## Document Version History

| Version | Date | Changes | Author |
|---------|------|---------|--------|
| 1.0 | 2026-04-09 | Initial design proposal | UX Designer |

---

**End of Document**
