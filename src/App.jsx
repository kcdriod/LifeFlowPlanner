import { memo, useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, LayoutGroup, motion } from "framer-motion";
import DOMPurify from "dompurify";
import {
  Bold,
  Code2,
  Columns2,
  Copy,
  Download,
  Eye,
  FilePlus2,
  Heading1,
  KanbanSquare,
  Link2,
  List,
  ListOrdered,
  Pin,
  PinOff,
  PencilLine,
  NotebookPen,
  Plus,
  Quote,
  Search,
  Settings2,
  CalendarDays,
  UserRound,
  Tag,
  Trash2,
  Moon,
  Sun,
  Upload
} from "lucide-react";
import { marked } from "marked";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

const TASKS_STORAGE_KEY = "kanban.board.v1";
const NOTES_STORAGE_KEY = "kanban.notes.v1";
const WORKSPACE_STORAGE_KEY = "kanban.workspace.v1";
const VIEW_STORAGE_KEY = "kanban.view.v1";
const THEME_STORAGE_KEY = "kanban.theme.v1";

const STATUSES = [
  { id: "backlog", label: "Backlog" },
  { id: "in-progress", label: "In Progress" },
  { id: "review", label: "Review" },
  { id: "done", label: "Done" }
];

const priorityClass = {
  low: "bg-emerald-700/90 text-white border-emerald-800",
  medium: "bg-amber-600 text-white border-amber-700",
  high: "bg-orange-700 text-white border-orange-800",
  urgent: "bg-red-700 text-white border-red-800"
};

const MotionCard = motion(Card);
const easeOut = [0.22, 1, 0.36, 1];
const springLayout = { type: "spring", stiffness: 500, damping: 36, mass: 0.7 };

marked.setOptions({
  gfm: true,
  breaks: true
});

const blankForm = {
  title: "",
  description: "",
  priority: "medium",
  status: "backlog",
  assignee: "",
  dueDate: "",
  tags: ""
};

const blankProjectForm = {
  name: "",
  description: ""
};

function createNote(overrides = {}) {
  const now = Date.now();
  return {
    id: crypto.randomUUID(),
    title: "Untitled note",
    content: "",
    tags: [],
    pinned: false,
    createdAt: now,
    updatedAt: now,
    ...overrides
  };
}

function buildInitialNotesState(projectName = "Project") {
  const starter = createNote({
    title: `${projectName} Notes`,
    content:
      `# ${projectName} Notes\n\n## Highlights\n- Keep roadmap updates here\n- Track blockers and decisions\n\n## Next Actions\n- [ ] Add sprint goals\n- [ ] Add meeting notes\n`
  });

  return {
    notes: [starter],
    activeNoteId: starter.id
  };
}

function seedTasks() {
  const now = Date.now();
  return [
    {
      id: crypto.randomUUID(),
      title: "Define project scope",
      description: "Capture business goals, constraints, and MVP boundaries.",
      status: "backlog",
      priority: "high",
      assignee: "Product Team",
      dueDate: "",
      tags: ["planning", "mvp"],
      createdAt: now - 10000
    },
    {
      id: crypto.randomUUID(),
      title: "Design board wireframes",
      description: "Prepare desktop and mobile layout plus interactions.",
      status: "in-progress",
      priority: "medium",
      assignee: "Design",
      dueDate: "",
      tags: ["ux", "ui"],
      createdAt: now - 9000
    },
    {
      id: crypto.randomUUID(),
      title: "Review API integration",
      description: "Validate endpoints and failure handling before release.",
      status: "review",
      priority: "urgent",
      assignee: "Backend",
      dueDate: "",
      tags: ["api", "qa"],
      createdAt: now - 8000
    }
  ];
}

function normalizeTask(task, index) {
  const fallbackStatus = "backlog";
  const fallbackPriority = "medium";
  const now = Date.now();
  return {
    id: typeof task?.id === "string" && task.id ? task.id : crypto.randomUUID(),
    title:
      typeof task?.title === "string" && task.title.trim() ? task.title.trim() : `Task ${index + 1}`,
    description: typeof task?.description === "string" ? task.description : "",
    status: STATUSES.some((status) => status.id === task?.status) ? task.status : fallbackStatus,
    priority: Object.hasOwn(priorityClass, task?.priority) ? task.priority : fallbackPriority,
    assignee: typeof task?.assignee === "string" ? task.assignee : "",
    dueDate: typeof task?.dueDate === "string" ? task.dueDate : "",
    tags: Array.isArray(task?.tags) ? task.tags.map((tag) => String(tag).trim()).filter(Boolean) : [],
    createdAt: Number.isFinite(task?.createdAt) ? task.createdAt : now - index
  };
}

function normalizeTasks(source, fallback = []) {
  if (!Array.isArray(source)) return fallback;
  return source.filter(Boolean).map((task, index) => normalizeTask(task, index));
}

function normalizeNotesState(source, projectName = "Project") {
  const fallback = buildInitialNotesState(projectName);

  if (source == null) return fallback;

  if (typeof source === "string") {
    const migrated = createNote({
      title: `${projectName} Notes`,
      content: source
    });
    return { notes: [migrated], activeNoteId: migrated.id };
  }

  if (Array.isArray(source)) {
    const migratedArray = source
      .filter(Boolean)
      .map((note, index) =>
        createNote({
          title:
            typeof note?.title === "string" && note.title.trim() ? note.title.trim() : `Note ${index + 1}`,
          content: typeof note?.content === "string" ? note.content : "",
          tags: Array.isArray(note?.tags) ? note.tags.map((tag) => String(tag).trim()).filter(Boolean) : [],
          pinned: Boolean(note?.pinned),
          createdAt: Number.isFinite(note?.createdAt) ? note.createdAt : Date.now() - index,
          updatedAt: Number.isFinite(note?.updatedAt) ? note.updatedAt : Date.now() - index
        })
      );
    if (migratedArray.length === 0) return fallback;
    return { notes: migratedArray, activeNoteId: migratedArray[0].id };
  }

  if (typeof source === "object" && Array.isArray(source.notes)) {
    const migratedNotes = source.notes
      .filter(Boolean)
      .map((note, index) =>
        createNote({
          id: typeof note?.id === "string" && note.id ? note.id : crypto.randomUUID(),
          title:
            typeof note?.title === "string" && note.title.trim() ? note.title.trim() : `Note ${index + 1}`,
          content: typeof note?.content === "string" ? note.content : "",
          tags: Array.isArray(note?.tags) ? note.tags.map((tag) => String(tag).trim()).filter(Boolean) : [],
          pinned: Boolean(note?.pinned),
          createdAt: Number.isFinite(note?.createdAt) ? note.createdAt : Date.now() - index,
          updatedAt: Number.isFinite(note?.updatedAt) ? note.updatedAt : Date.now() - index
        })
      );

    if (migratedNotes.length === 0) return fallback;

    const hasActiveId = migratedNotes.some((note) => note.id === source.activeNoteId);
    return {
      notes: migratedNotes,
      activeNoteId: hasActiveId ? source.activeNoteId : migratedNotes[0].id
    };
  }

  return fallback;
}

function createProject(overrides = {}) {
  const now = Date.now();
  const name = typeof overrides.name === "string" && overrides.name.trim() ? overrides.name.trim() : "Untitled Project";
  const description = typeof overrides.description === "string" ? overrides.description : "";

  return {
    id: typeof overrides.id === "string" && overrides.id ? overrides.id : crypto.randomUUID(),
    name,
    description,
    tasks: normalizeTasks(overrides.tasks),
    notesState: normalizeNotesState(overrides.notesState, name),
    createdAt: Number.isFinite(overrides.createdAt) ? overrides.createdAt : now,
    updatedAt: Number.isFinite(overrides.updatedAt) ? overrides.updatedAt : now
  };
}

function buildFallbackWorkspace() {
  let legacyTasks = seedTasks();
  let legacyNotesState = buildInitialNotesState("Main Project");
  try {
    const rawTasks = localStorage.getItem(TASKS_STORAGE_KEY);
    if (rawTasks) {
      const parsedTasks = JSON.parse(rawTasks);
      legacyTasks = normalizeTasks(parsedTasks, seedTasks());
    }
  } catch {
    legacyTasks = seedTasks();
  }

  try {
    const rawNotes = localStorage.getItem(NOTES_STORAGE_KEY);
    if (rawNotes) {
      const parsedNotes = JSON.parse(rawNotes);
      legacyNotesState = normalizeNotesState(parsedNotes, "Main Project");
    }
  } catch {
    legacyNotesState = buildInitialNotesState("Main Project");
  }

  const legacyProject = createProject({
    name: "Main Project",
    description: "Migrated from your existing board.",
    tasks: legacyTasks,
    notesState: legacyNotesState
  });

  return {
    projects: [legacyProject],
    activeProjectId: legacyProject.id
  };
}

function loadWorkspace() {
  const fallback = buildFallbackWorkspace();

  try {
    const raw = localStorage.getItem(WORKSPACE_STORAGE_KEY);
    if (!raw) return fallback;

    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || !Array.isArray(parsed.projects)) return fallback;

    const projects = parsed.projects
      .filter(Boolean)
      .map((project, index) =>
        createProject({
          ...project,
          name:
            typeof project?.name === "string" && project.name.trim() ? project.name.trim() : `Project ${index + 1}`,
          description: typeof project?.description === "string" ? project.description : ""
        })
      );

    if (projects.length === 0) return fallback;

    const hasActiveId = projects.some((project) => project.id === parsed.activeProjectId);
    return {
      projects,
      activeProjectId: hasActiveId ? parsed.activeProjectId : projects[0].id
    };
  } catch {
    return fallback;
  }
}

function loadView() {
  const value = localStorage.getItem(VIEW_STORAGE_KEY);
  return value === "notes" ? "notes" : "board";
}

function loadTheme() {
  const saved = localStorage.getItem(THEME_STORAGE_KEY);
  if (saved === "dark" || saved === "light") return saved;
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function formatDueDate(value) {
  if (!value) return "No due date";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "No due date";
  return `Due ${date.toLocaleDateString()}`;
}

function formatLastSaved(value) {
  return value.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

function formatNoteTimestamp(value) {
  return new Date(value).toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit"
  });
}

function estimateReadingTime(wordCount) {
  if (wordCount <= 0) return "0 min read";
  const minutes = Math.max(1, Math.round(wordCount / 200));
  return `${minutes} min read`;
}

function fileNameFromTitle(title) {
  const safeTitle = title.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
  return safeTitle || "note";
}

const TaskItem = memo(function TaskItem({
  task,
  index,
  isDragging,
  onEdit,
  onDelete,
  onDragStart,
  onDragEnd
}) {
  const delay = Math.min(index * 0.03, 0.15);

  return (
    <MotionCard
      draggable
      aria-grabbed={isDragging}
      onDragStart={(event) => onDragStart(event, task.id)}
      onDragEnd={onDragEnd}
      layout
      layoutId={`task-${task.id}`}
      initial={{ opacity: 0, y: 10, scale: 0.99 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -6, scale: 0.985 }}
      transition={{
        layout: springLayout,
        default: { duration: 0.24, ease: easeOut, delay }
      }}
      whileHover={
        isDragging
          ? undefined
          : { y: -2, boxShadow: "0 14px 24px -14px rgba(16, 24, 40, 0.62)" }
      }
      whileTap={{ scale: 0.995 }}
      className={cn(
        "kanban-task border-border/90 bg-card",
        isDragging && "is-dragging border-primary/50"
      )}
    >
      <CardHeader className="space-y-2 pb-2">
        <div className="flex items-start justify-between gap-2">
          <CardTitle className="text-sm leading-snug">{task.title}</CardTitle>
          <Badge className={cn("uppercase", priorityClass[task.priority])}>{task.priority}</Badge>
        </div>
        {task.description && (
          <CardDescription className="line-clamp-3 text-xs leading-relaxed">
            {task.description}
          </CardDescription>
        )}
      </CardHeader>

      <CardContent className="space-y-3">
        <div className="flex flex-wrap gap-1.5 text-xs text-muted-foreground">
          <Badge className="gap-1 border-border/80 bg-secondary text-secondary-foreground">
            <CalendarDays className="h-3.5 w-3.5" />
            {formatDueDate(task.dueDate)}
          </Badge>
          {task.assignee && (
            <Badge className="gap-1 border-border/80 bg-secondary text-secondary-foreground">
              <UserRound className="h-3.5 w-3.5" />
              {task.assignee}
            </Badge>
          )}
          {task.tags.map((tag) => (
            <Badge key={`${task.id}-${tag}`} className="gap-1 border-border/80 bg-secondary text-secondary-foreground">
              <Tag className="h-3.5 w-3.5" />
              {tag}
            </Badge>
          ))}
        </div>

        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => onEdit(task)}>
            Edit
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="text-destructive hover:text-destructive"
            onClick={() => onDelete(task.id)}
          >
            Delete
          </Button>
        </div>
      </CardContent>
    </MotionCard>
  );
});

function App() {
  const [workspace, setWorkspace] = useState(loadWorkspace);
  const [view, setView] = useState(loadView);
  const [theme, setTheme] = useState(loadTheme);
  const [searchText, setSearchText] = useState("");
  const [priorityFilter, setPriorityFilter] = useState("all");
  const [noteSearchText, setNoteSearchText] = useState("");
  const [notesMode, setNotesMode] = useState("split");
  const [dragOverStatus, setDragOverStatus] = useState("");
  const [draggedTaskId, setDraggedTaskId] = useState("");
  const [dropPulseStatus, setDropPulseStatus] = useState("");
  const [isSavingNotes, setIsSavingNotes] = useState(false);
  const [lastSavedAt, setLastSavedAt] = useState(() => new Date());

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingTaskId, setEditingTaskId] = useState(null);
  const [formValues, setFormValues] = useState(blankForm);
  const [projectDialogOpen, setProjectDialogOpen] = useState(false);
  const [projectDialogMode, setProjectDialogMode] = useState("create");
  const [projectFormValues, setProjectFormValues] = useState(blankProjectForm);
  const notesEditorRef = useRef(null);
  const deferredSearchText = useDeferredValue(searchText);

  const activeProject = useMemo(() => {
    if (workspace.projects.length === 0) return null;
    return (
      workspace.projects.find((project) => project.id === workspace.activeProjectId) ?? workspace.projects[0]
    );
  }, [workspace]);

  const tasks = activeProject?.tasks ?? [];
  const notesState = activeProject?.notesState ?? { notes: [], activeNoteId: "" };

  useEffect(() => {
    localStorage.setItem(WORKSPACE_STORAGE_KEY, JSON.stringify(workspace));
  }, [workspace]);

  useEffect(() => {
    if (!activeProject) return;
    setIsSavingNotes(true);
    const handle = window.setTimeout(() => {
      setIsSavingNotes(false);
      setLastSavedAt(new Date());
    }, 240);
    return () => window.clearTimeout(handle);
  }, [notesState, activeProject]);

  useEffect(() => {
    localStorage.setItem(VIEW_STORAGE_KEY, view);
  }, [view]);

  useEffect(() => {
    localStorage.setItem(THEME_STORAGE_KEY, theme);
    document.documentElement.classList.toggle("dark", theme === "dark");
    document.documentElement.style.colorScheme = theme;
  }, [theme]);

  useEffect(() => {
    if (!dropPulseStatus) return;
    const timeout = window.setTimeout(() => setDropPulseStatus(""), 320);
    return () => window.clearTimeout(timeout);
  }, [dropPulseStatus]);

  const patchActiveProject = useCallback((updater) => {
    setWorkspace((current) => {
      if (current.projects.length === 0) return current;

      const fallbackId = current.projects[0].id;
      const activeId = current.projects.some((project) => project.id === current.activeProjectId)
        ? current.activeProjectId
        : fallbackId;

      return {
        ...current,
        activeProjectId: activeId,
        projects: current.projects.map((project) => {
          if (project.id !== activeId) return project;
          const nextProject = updater(project) ?? project;
          return {
            ...nextProject,
            updatedAt: Date.now()
          };
        })
      };
    });
  }, []);

  const groupedTasks = useMemo(() => {
    const query = deferredSearchText.trim().toLowerCase();
    const filtered = tasks
      .filter((task) => {
        if (priorityFilter === "all") return true;
        return task.priority === priorityFilter;
      })
      .filter((task) => {
        if (!query) return true;
        const text = [task.title, task.description, task.assignee, task.tags.join(" ")]
          .join(" ")
          .toLowerCase();
        return text.includes(query);
      })
      .sort((a, b) => b.createdAt - a.createdAt);

    const initial = {
      backlog: [],
      "in-progress": [],
      review: [],
      done: []
    };

    for (const task of filtered) {
      initial[task.status].push(task);
    }

    return initial;
  }, [tasks, deferredSearchText, priorityFilter]);

  const activeNote = useMemo(
    () => notesState.notes.find((note) => note.id === notesState.activeNoteId) ?? null,
    [notesState]
  );

  const filteredNotes = useMemo(() => {
    const query = noteSearchText.trim().toLowerCase();
    return [...notesState.notes]
      .filter((note) => {
        if (!query) return true;
        const haystack = [note.title, note.content, note.tags.join(" ")].join(" ").toLowerCase();
        return haystack.includes(query);
      })
      .sort((a, b) => {
        if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
        return b.updatedAt - a.updatedAt;
      });
  }, [notesState.notes, noteSearchText]);

  const noteMetrics = useMemo(() => {
    if (!activeNote) return { words: 0, characters: 0, readTime: "0 min read" };
    const content = activeNote.content;
    const words = (content.trim().match(/\b[\w'-]+\b/g) || []).length;
    return {
      words,
      characters: content.length,
      readTime: estimateReadingTime(words)
    };
  }, [activeNote]);

  const renderedPreview = useMemo(() => {
    if (!activeNote) return "";
    return DOMPurify.sanitize(marked.parse(activeNote.content));
  }, [activeNote]);

  const openCreateProjectDialog = useCallback(() => {
    setProjectDialogMode("create");
    setProjectFormValues(blankProjectForm);
    setProjectDialogOpen(true);
  }, []);

  const openEditProjectDialog = useCallback(() => {
    if (!activeProject) return;
    setProjectDialogMode("edit");
    setProjectFormValues({
      name: activeProject.name,
      description: activeProject.description
    });
    setProjectDialogOpen(true);
  }, [activeProject]);

  const openCreateDialog = useCallback(() => {
    setEditingTaskId(null);
    setFormValues(blankForm);
    setDialogOpen(true);
  }, []);

  const openEditDialog = useCallback((task) => {
    setEditingTaskId(task.id);
    setFormValues({
      title: task.title,
      description: task.description,
      priority: task.priority,
      status: task.status,
      assignee: task.assignee,
      dueDate: task.dueDate,
      tags: task.tags.join(", ")
    });
    setDialogOpen(true);
  }, []);

  const handleProjectFieldChange = useCallback((event) => {
    const { name, value } = event.target;
    setProjectFormValues((current) => ({ ...current, [name]: value }));
  }, []);

  const handleSaveProject = useCallback(
    (event) => {
      event.preventDefault();
      const name = projectFormValues.name.trim();
      if (!name) return;
      const description = projectFormValues.description.trim();

      if (projectDialogMode === "create") {
        const nextProject = createProject({
          name,
          description,
          tasks: [],
          notesState: buildInitialNotesState(name)
        });

        setWorkspace((current) => ({
          projects: [nextProject, ...current.projects],
          activeProjectId: nextProject.id
        }));
      } else {
        patchActiveProject((project) => ({
          ...project,
          name,
          description
        }));
      }

      setProjectDialogOpen(false);
    },
    [patchActiveProject, projectDialogMode, projectFormValues.description, projectFormValues.name]
  );

  const handleDeleteActiveProject = useCallback(() => {
    if (!activeProject) return;

    const confirmed = window.confirm(
      `Delete project "${activeProject.name}" and all its tasks and notes? This cannot be undone.`
    );
    if (!confirmed) return;

    setWorkspace((current) => {
      const remaining = current.projects.filter((project) => project.id !== activeProject.id);

      if (remaining.length === 0) {
        const fallbackProject = createProject({
          name: "New Project",
          description: "",
          tasks: [],
          notesState: buildInitialNotesState("New Project")
        });
        return {
          projects: [fallbackProject],
          activeProjectId: fallbackProject.id
        };
      }

      const nextActiveId =
        current.activeProjectId === activeProject.id ? remaining[0].id : current.activeProjectId;

      return {
        projects: remaining,
        activeProjectId: remaining.some((project) => project.id === nextActiveId)
          ? nextActiveId
          : remaining[0].id
      };
    });
  }, [activeProject]);

  const updateActiveNote = useCallback((updates) => {
    patchActiveProject((project) => {
      const activeId = project.notesState.activeNoteId;
      if (!activeId) return project;

      return {
        ...project,
        notesState: {
          ...project.notesState,
          notes: project.notesState.notes.map((note) =>
            note.id === activeId
              ? {
                  ...note,
                  ...updates,
                  updatedAt: Date.now()
                }
              : note
          )
        }
      };
    });
  }, [patchActiveProject]);

  const selectNote = useCallback((noteId) => {
    patchActiveProject((project) => ({
      ...project,
      notesState: {
        ...project.notesState,
        activeNoteId: noteId
      }
    }));
  }, [patchActiveProject]);

  const createNewNote = useCallback(() => {
    const next = createNote({
      title: `${activeProject?.name ?? "Project"} Note`
    });
    patchActiveProject((project) => ({
      ...project,
      notesState: {
        notes: [next, ...project.notesState.notes],
        activeNoteId: next.id
      }
    }));
  }, [activeProject, patchActiveProject]);

  const duplicateActiveNote = useCallback(() => {
    if (!activeNote) return;
    const copy = createNote({
      title: `${activeNote.title} (Copy)`,
      content: activeNote.content,
      tags: [...activeNote.tags],
      pinned: false
    });
    patchActiveProject((project) => ({
      ...project,
      notesState: {
        notes: [copy, ...project.notesState.notes],
        activeNoteId: copy.id
      }
    }));
  }, [activeNote, patchActiveProject]);

  const deleteActiveNote = useCallback(() => {
    if (!activeNote) return;
    const confirmed = window.confirm(`Delete "${activeNote.title}"? This cannot be undone.`);
    if (!confirmed) return;

    patchActiveProject((project) => {
      const remaining = project.notesState.notes.filter(
        (note) => note.id !== project.notesState.activeNoteId
      );
      if (remaining.length === 0) {
        const next = createNote({
          title: `${project.name} Notes`
        });
        return {
          ...project,
          notesState: { notes: [next], activeNoteId: next.id }
        };
      }
      return {
        ...project,
        notesState: { notes: remaining, activeNoteId: remaining[0].id }
      };
    });
  }, [activeNote, patchActiveProject]);

  const togglePinned = useCallback(() => {
    if (!activeNote) return;
    updateActiveNote({ pinned: !activeNote.pinned });
  }, [activeNote, updateActiveNote]);

  const exportActiveNote = useCallback(() => {
    if (!activeNote) return;
    const blob = new Blob([activeNote.content], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${fileNameFromTitle(activeNote.title)}.md`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  }, [activeNote]);

  const handleImportNote = useCallback(async (event) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    const content = await file.text();
    const title = file.name.replace(/\.[^/.]+$/, "") || "Imported note";
    const next = createNote({
      title,
      content
    });

    patchActiveProject((project) => ({
      ...project,
      notesState: {
        notes: [next, ...project.notesState.notes],
        activeNoteId: next.id
      }
    }));
  }, [patchActiveProject]);

  const insertMarkdown = useCallback(
    (before, after = "", placeholder = "text") => {
      if (!activeNote) return;
      const textarea = notesEditorRef.current;
      if (!textarea) return;

      const start = textarea.selectionStart;
      const end = textarea.selectionEnd;
      const selected = activeNote.content.slice(start, end);
      const content = selected || placeholder;
      const nextValue =
        activeNote.content.slice(0, start) + before + content + after + activeNote.content.slice(end);

      updateActiveNote({ content: nextValue });

      window.requestAnimationFrame(() => {
        textarea.focus();
        const cursorStart = start + before.length;
        const cursorEnd = cursorStart + content.length;
        textarea.setSelectionRange(cursorStart, cursorEnd);
      });
    },
    [activeNote, updateActiveNote]
  );

  function handleFieldChange(event) {
    const { name, value } = event.target;
    setFormValues((current) => ({ ...current, [name]: value }));
  }

  function handleSaveTask(event) {
    event.preventDefault();
    const title = formValues.title.trim();
    if (!title) return;

    const parsedTags = formValues.tags
      .split(",")
      .map((tag) => tag.trim())
      .filter(Boolean);

    const payload = {
      title,
      description: formValues.description.trim(),
      priority: formValues.priority,
      status: formValues.status,
      assignee: formValues.assignee.trim(),
      dueDate: formValues.dueDate,
      tags: parsedTags
    };

    if (editingTaskId) {
      patchActiveProject((project) => ({
        ...project,
        tasks: project.tasks.map((task) => (task.id === editingTaskId ? { ...task, ...payload } : task))
      }));
    } else {
      patchActiveProject((project) => ({
        ...project,
        tasks: [
          {
            id: crypto.randomUUID(),
            createdAt: Date.now(),
            ...payload
          },
          ...project.tasks
        ]
      }));
    }

    setDialogOpen(false);
  }

  const handleDeleteTask = useCallback((taskId) => {
    patchActiveProject((project) => ({
      ...project,
      tasks: project.tasks.filter((task) => task.id !== taskId)
    }));
  }, [patchActiveProject]);

  const handleDrop = useCallback((status, event) => {
    event.preventDefault();
    const taskId = event.dataTransfer.getData("text/task-id");
    if (!taskId) return;

    patchActiveProject((project) => ({
      ...project,
      tasks: project.tasks.map((task) => (task.id === taskId ? { ...task, status } : task))
    }));
    setDraggedTaskId("");
    setDragOverStatus("");
    setDropPulseStatus(status);
  }, [patchActiveProject]);

  const handleTaskDragStart = useCallback((event, taskId) => {
    event.dataTransfer.setData("text/task-id", taskId);
    event.dataTransfer.effectAllowed = "move";
    setDraggedTaskId(taskId);
  }, []);

  const handleTaskDragEnd = useCallback(() => {
    setDraggedTaskId("");
    setDragOverStatus("");
  }, []);

  return (
    <main className="mx-auto w-[min(1320px,94vw)] py-8">
      <header className="mb-5 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Project Workspace</p>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight sm:text-4xl">
            {activeProject?.name ?? "Kanban Board"}
          </h1>
          <p className="mt-2 max-w-3xl text-sm text-muted-foreground">
            {activeProject?.description || "Add a project description to define scope, goals, and context."}
          </p>
        </div>

        <div className="flex w-full max-w-[320px] items-center gap-2">
          <Tabs value={view} onValueChange={setView} className="flex-1">
            <TabsList className="w-full">
              <TabsTrigger value="board" className="gap-2">
                <KanbanSquare className="h-4 w-4" />
                Kanban
              </TabsTrigger>
              <TabsTrigger value="notes" className="gap-2">
                <NotebookPen className="h-4 w-4" />
                Notes
              </TabsTrigger>
            </TabsList>
          </Tabs>
          <Button
            variant="outline"
            size="icon"
            aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
            onClick={() => setTheme((current) => (current === "dark" ? "light" : "dark"))}
          >
            {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          </Button>
        </div>
      </header>

      <section className="mb-4 grid grid-cols-1 gap-3 rounded-xl border bg-card/80 p-3 shadow-sm lg:grid-cols-[minmax(0,1fr)_auto]">
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
          <label className="space-y-1">
            <span className="text-xs text-muted-foreground">Project</span>
            <select
              className="h-10 w-full rounded-md border border-input bg-card px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              value={activeProject?.id ?? ""}
              onChange={(event) =>
                setWorkspace((current) => ({ ...current, activeProjectId: event.target.value }))
              }
            >
              {workspace.projects.map((project) => (
                <option key={project.id} value={project.id}>
                  {project.name}
                </option>
              ))}
            </select>
          </label>

          <div className="flex flex-wrap items-end gap-2">
            <Button className="gap-2" onClick={openCreateProjectDialog}>
              <Plus className="h-4 w-4" />
              New Project
            </Button>
            <Button variant="outline" className="gap-2" onClick={openEditProjectDialog}>
              <Settings2 className="h-4 w-4" />
              Edit Details
            </Button>
            <Button
              variant="ghost"
              className="text-destructive hover:text-destructive"
              onClick={handleDeleteActiveProject}
            >
              Delete Project
            </Button>
          </div>
        </div>

        <div className="flex items-end justify-end">
          <Badge className="border-muted-foreground/30 bg-muted text-muted-foreground">
            {workspace.projects.length} {workspace.projects.length === 1 ? "Project" : "Projects"}
          </Badge>
        </div>
      </section>

      <AnimatePresence mode="wait" initial={false}>
        {view === "board" ? (
          <motion.div
            key="board"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.25, ease: easeOut }}
            className="space-y-0"
          >
            <motion.section
              layout
              className="mb-4 grid grid-cols-1 gap-3 rounded-xl border bg-card/85 p-3 shadow-sm sm:grid-cols-[1.4fr_180px_auto]"
            >
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-3.5 h-4 w-4 text-muted-foreground" />
                <Input
                  className="pl-9"
                  type="search"
                  placeholder="Search by title, assignee, tags..."
                  value={searchText}
                  onChange={(event) => setSearchText(event.target.value)}
                />
              </div>

              <select
                className="h-10 rounded-md border border-input bg-card px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                value={priorityFilter}
                onChange={(event) => setPriorityFilter(event.target.value)}
              >
                <option value="all">All Priorities</option>
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
                <option value="urgent">Urgent</option>
              </select>

              <Button className="gap-2" onClick={openCreateDialog}>
                <Plus className="h-4 w-4" />
                Add Task
              </Button>
            </motion.section>

            <LayoutGroup id="kanban-layout">
              <motion.section layout className="kanban-board grid grid-cols-1 gap-3 lg:grid-cols-2 xl:grid-cols-4">
                {STATUSES.map((column, columnIndex) => {
                  const columnTasks = groupedTasks[column.id] ?? [];
                  return (
                    <MotionCard
                      key={column.id}
                      layout
                      initial={{ opacity: 0, y: 12, scale: 0.995 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      transition={{
                        layout: springLayout,
                        default: { duration: 0.25, ease: easeOut, delay: columnIndex * 0.05 }
                      }}
                      className={cn(
                        "kanban-column min-h-[420px] border-border/70 bg-card/75",
                        dragOverStatus === column.id && "kanban-drop-active border-primary/60 bg-primary/5",
                        dropPulseStatus === column.id && "kanban-drop-pulse"
                      )}
                      onDragEnter={() =>
                        setDragOverStatus((current) => (current === column.id ? current : column.id))
                      }
                      onDragOver={(event) => event.preventDefault()}
                      onDragLeave={() => setDragOverStatus("")}
                      onDrop={(event) => handleDrop(column.id, event)}
                    >
                      <CardHeader className="pb-2">
                        <div className="flex items-center justify-between">
                          <CardTitle className="text-base">{column.label}</CardTitle>
                          <Badge className="border-muted-foreground/30 bg-muted text-muted-foreground">
                            {columnTasks.length}
                          </Badge>
                        </div>
                      </CardHeader>

                      <CardContent className="space-y-2">
                        {columnTasks.length === 0 && (
                          <div className="rounded-md border border-dashed border-border px-3 py-4 text-center text-xs text-muted-foreground">
                            No tasks match this view.
                          </div>
                        )}

                        <AnimatePresence initial={false} mode="popLayout">
                          {columnTasks.map((task, taskIndex) => (
                            <TaskItem
                              key={task.id}
                              task={task}
                              index={taskIndex}
                              isDragging={draggedTaskId === task.id}
                              onEdit={openEditDialog}
                              onDelete={handleDeleteTask}
                              onDragStart={handleTaskDragStart}
                              onDragEnd={handleTaskDragEnd}
                            />
                          ))}
                        </AnimatePresence>
                      </CardContent>
                    </MotionCard>
                  );
                })}
              </motion.section>
            </LayoutGroup>
          </motion.div>
        ) : (
          <motion.div
            key="notes"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.25, ease: easeOut }}
          >
            <section className="grid grid-cols-1 gap-3 lg:grid-cols-[290px_1fr]">
              <Card className="border-border/70 bg-card/85">
                <CardHeader className="space-y-3 pb-3">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-base">Notes</CardTitle>
                    <Button size="sm" className="gap-1.5" onClick={createNewNote}>
                      <FilePlus2 className="h-4 w-4" />
                      New
                    </Button>
                  </div>
                  <div className="relative">
                    <Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                    <Input
                      className="h-9 pl-9"
                      placeholder="Search notes..."
                      value={noteSearchText}
                      onChange={(event) => setNoteSearchText(event.target.value)}
                    />
                  </div>
                </CardHeader>
                <CardContent className="space-y-2">
                  {filteredNotes.map((note) => (
                    <button
                      key={note.id}
                      type="button"
                      onClick={() => selectNote(note.id)}
                      className={cn(
                        "w-full rounded-lg border px-3 py-2 text-left transition",
                        notesState.activeNoteId === note.id
                          ? "border-primary/55 bg-primary/10"
                          : "border-border/70 bg-card hover:bg-accent/45"
                      )}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <p className="line-clamp-1 text-sm font-medium">{note.title}</p>
                        {note.pinned && <Pin className="mt-0.5 h-3.5 w-3.5 text-primary" />}
                      </div>
                      <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                        {note.content || "No content yet"}
                      </p>
                      <p className="mt-2 text-[11px] text-muted-foreground">
                        Updated {formatNoteTimestamp(note.updatedAt)}
                      </p>
                    </button>
                  ))}

                  {filteredNotes.length === 0 && (
                    <div className="rounded-md border border-dashed border-border px-3 py-6 text-center text-xs text-muted-foreground">
                      No notes match your search.
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card className="border-border/70 bg-card/80">
                <CardHeader className="space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <CardTitle className="text-xl">Professional Notes</CardTitle>
                    <Badge className="border-muted-foreground/30 bg-muted text-muted-foreground">
                      {isSavingNotes ? "Saving..." : `Saved ${formatLastSaved(lastSavedAt)}`}
                    </Badge>
                  </div>

                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-[1.2fr_1fr_auto]">
                    <Input
                      value={activeNote?.title ?? ""}
                      onChange={(event) => updateActiveNote({ title: event.target.value || "Untitled note" })}
                      placeholder="Note title"
                    />
                    <Input
                      value={activeNote?.tags.join(", ") ?? ""}
                      onChange={(event) =>
                        updateActiveNote({
                          tags: event.target.value
                            .split(",")
                            .map((tag) => tag.trim())
                            .filter(Boolean)
                        })
                      }
                      placeholder="tags, planning, sprint"
                    />
                    <div className="flex items-center gap-1">
                      <Button type="button" variant="outline" size="icon" onClick={togglePinned} aria-label="Pin note">
                        {activeNote?.pinned ? <PinOff className="h-4 w-4" /> : <Pin className="h-4 w-4" />}
                      </Button>
                      <Button type="button" variant="outline" size="icon" onClick={duplicateActiveNote} aria-label="Duplicate note">
                        <Copy className="h-4 w-4" />
                      </Button>
                      <Button type="button" variant="outline" size="icon" onClick={deleteActiveNote} aria-label="Delete note">
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-1">
                      <Button type="button" size="sm" variant="outline" className="h-8 px-2" onClick={() => insertMarkdown("**", "**", "bold text")}>
                        <Bold className="h-4 w-4" />
                      </Button>
                      <Button type="button" size="sm" variant="outline" className="h-8 px-2" onClick={() => insertMarkdown("# ", "", "Heading")}>
                        <Heading1 className="h-4 w-4" />
                      </Button>
                      <Button type="button" size="sm" variant="outline" className="h-8 px-2" onClick={() => insertMarkdown("- ", "", "List item")}>
                        <List className="h-4 w-4" />
                      </Button>
                      <Button type="button" size="sm" variant="outline" className="h-8 px-2" onClick={() => insertMarkdown("1. ", "", "First item")}>
                        <ListOrdered className="h-4 w-4" />
                      </Button>
                      <Button type="button" size="sm" variant="outline" className="h-8 px-2" onClick={() => insertMarkdown("> ", "", "Quote")}>
                        <Quote className="h-4 w-4" />
                      </Button>
                      <Button type="button" size="sm" variant="outline" className="h-8 px-2" onClick={() => insertMarkdown("`", "`", "code")}>
                        <Code2 className="h-4 w-4" />
                      </Button>
                      <Button type="button" size="sm" variant="outline" className="h-8 px-2" onClick={() => insertMarkdown("[", "](https://example.com)", "link")}>
                        <Link2 className="h-4 w-4" />
                      </Button>
                    </div>

                    <div className="flex items-center gap-1">
                      <Button
                        type="button"
                        size="sm"
                        variant={notesMode === "edit" ? "default" : "outline"}
                        className="h-8 gap-1 px-2"
                        onClick={() => setNotesMode("edit")}
                      >
                        <PencilLine className="h-4 w-4" />
                        Edit
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant={notesMode === "preview" ? "default" : "outline"}
                        className="h-8 gap-1 px-2"
                        onClick={() => setNotesMode("preview")}
                      >
                        <Eye className="h-4 w-4" />
                        Preview
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant={notesMode === "split" ? "default" : "outline"}
                        className="h-8 gap-1 px-2"
                        onClick={() => setNotesMode("split")}
                      >
                        <Columns2 className="h-4 w-4" />
                        Split
                      </Button>
                    </div>
                  </div>
                </CardHeader>

                <CardContent className="space-y-3">
                  <div className={cn("grid gap-3", notesMode === "split" ? "grid-cols-1 xl:grid-cols-2" : "grid-cols-1")}>
                    {notesMode !== "preview" && (
                      <Textarea
                        ref={notesEditorRef}
                        className="min-h-[56vh] leading-relaxed"
                        placeholder="Write in Markdown..."
                        value={activeNote?.content ?? ""}
                        onChange={(event) => updateActiveNote({ content: event.target.value })}
                      />
                    )}

                    {notesMode !== "edit" && (
                      <div className="markdown-preview min-h-[56vh] rounded-md border border-border/70 bg-background/45 p-4">
                        {renderedPreview ? (
                          <div dangerouslySetInnerHTML={{ __html: renderedPreview }} />
                        ) : (
                          <p className="text-sm text-muted-foreground">Nothing to preview yet.</p>
                        )}
                      </div>
                    )}
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border/70 bg-background/45 px-3 py-2 text-xs text-muted-foreground">
                    <div className="flex flex-wrap items-center gap-3">
                      <span>{noteMetrics.words} words</span>
                      <span>{noteMetrics.characters} characters</span>
                      <span>{noteMetrics.readTime}</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <Button type="button" size="sm" variant="outline" className="h-8 gap-1 px-2" onClick={exportActiveNote}>
                        <Download className="h-4 w-4" />
                        Export MD
                      </Button>
                      <label className="inline-flex cursor-pointer items-center">
                        <input type="file" accept=".md,.txt,text/markdown,text/plain" className="hidden" onChange={handleImportNote} />
                        <span className="inline-flex h-8 items-center gap-1 rounded-md border border-input bg-background px-2 text-sm hover:bg-accent hover:text-accent-foreground">
                          <Upload className="h-4 w-4" />
                          Import
                        </span>
                      </label>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </section>
          </motion.div>
        )}
      </AnimatePresence>

      <Dialog open={projectDialogOpen} onOpenChange={setProjectDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{projectDialogMode === "create" ? "Create Project" : "Edit Project"}</DialogTitle>
            <DialogDescription>
              Manage separate boards and notes by project.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSaveProject} className="mt-4 space-y-3">
            <label className="space-y-1">
              <span className="text-xs text-muted-foreground">Project Name</span>
              <Input
                name="name"
                required
                maxLength={80}
                value={projectFormValues.name}
                onChange={handleProjectFieldChange}
                placeholder="Website Redesign"
              />
            </label>

            <label className="space-y-1">
              <span className="text-xs text-muted-foreground">Description</span>
              <Textarea
                name="description"
                rows={4}
                maxLength={400}
                value={projectFormValues.description}
                onChange={handleProjectFieldChange}
                placeholder="Goals, milestones, owners, and context for this project."
              />
            </label>

            <DialogFooter>
              <Button type="submit">{projectDialogMode === "create" ? "Create Project" : "Save Changes"}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingTaskId ? "Edit Task" : "Add Task"}</DialogTitle>
            <DialogDescription>
              Track status, ownership, and delivery details in one place.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSaveTask} className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label className="space-y-1 sm:col-span-2">
              <span className="text-xs text-muted-foreground">Title</span>
              <Input
                name="title"
                required
                maxLength={80}
                value={formValues.title}
                onChange={handleFieldChange}
              />
            </label>

            <label className="space-y-1">
              <span className="text-xs text-muted-foreground">Assignee</span>
              <Input
                name="assignee"
                maxLength={40}
                value={formValues.assignee}
                onChange={handleFieldChange}
              />
            </label>

            <label className="space-y-1">
              <span className="text-xs text-muted-foreground">Due Date</span>
              <Input
                type="date"
                name="dueDate"
                value={formValues.dueDate}
                onChange={handleFieldChange}
              />
            </label>

            <label className="space-y-1">
              <span className="text-xs text-muted-foreground">Priority</span>
              <select
                name="priority"
                className="h-10 w-full rounded-md border border-input bg-card px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                value={formValues.priority}
                onChange={handleFieldChange}
              >
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
                <option value="urgent">Urgent</option>
              </select>
            </label>

            <label className="space-y-1">
              <span className="text-xs text-muted-foreground">Status</span>
              <select
                name="status"
                className="h-10 w-full rounded-md border border-input bg-card px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                value={formValues.status}
                onChange={handleFieldChange}
              >
                <option value="backlog">Backlog</option>
                <option value="in-progress">In Progress</option>
                <option value="review">Review</option>
                <option value="done">Done</option>
              </select>
            </label>

            <label className="space-y-1 sm:col-span-2">
              <span className="text-xs text-muted-foreground">Tags (comma separated)</span>
              <Input
                name="tags"
                placeholder="frontend, urgent, customer"
                value={formValues.tags}
                onChange={handleFieldChange}
              />
            </label>

            <label className="space-y-1 sm:col-span-2">
              <span className="text-xs text-muted-foreground">Description</span>
              <Textarea
                name="description"
                rows={4}
                maxLength={600}
                value={formValues.description}
                onChange={handleFieldChange}
              />
            </label>

            <DialogFooter className="sm:col-span-2">
              {editingTaskId ? (
                <Button
                  type="button"
                  variant="destructive"
                  onClick={() => {
                    handleDeleteTask(editingTaskId);
                    setDialogOpen(false);
                  }}
                >
                  Delete
                </Button>
              ) : (
                <span />
              )}
              <Button type="submit">Save Task</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </main>
  );
}

export default App;
