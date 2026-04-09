import { useState, useEffect, useCallback, useRef } from "react";

export type IssueType = "leaves_drooping" | "pest_infected" | "other";

export type IssueState = {
  hasIssues: boolean;
  types?: IssueType[];
  description?: string;
  photoIds?: string[];
  communicatedToCustomer?: boolean;
};

export type ServiceDraft = {
  checklistState: Record<string, "done" | "pending" | "not_required">;
  careActionsDone: string[];
  specialTasksDone: string[];
  issueState: IssueState;
  hasClientRequest: boolean;
  scrollPosition: number;
};

const EMPTY_DRAFT: ServiceDraft = {
  checklistState: {},
  careActionsDone: [],
  specialTasksDone: [],
  issueState: { hasIssues: false },
  hasClientRequest: false,
  scrollPosition: 0,
};

function getKey(serviceId: string) {
  return `service-draft-${serviceId}`;
}

function loadDraft(serviceId: string): ServiceDraft | null {
  try {
    const raw = localStorage.getItem(getKey(serviceId));
    if (!raw) return null;
    return JSON.parse(raw) as ServiceDraft;
  } catch {
    return null;
  }
}

function saveDraft(serviceId: string, draft: ServiceDraft) {
  try {
    localStorage.setItem(getKey(serviceId), JSON.stringify(draft));
  } catch {
    // localStorage full or unavailable — silent fail
  }
}

export function clearDraft(serviceId: string) {
  try {
    localStorage.removeItem(getKey(serviceId));
  } catch {
    // silent
  }
}

export function useServiceDraft(serviceId: string, isActive: boolean) {
  const [draft, setDraft] = useState<ServiceDraft>(EMPTY_DRAFT);
  const initialized = useRef(false);
  const saveTimeout = useRef<ReturnType<typeof setTimeout>>(undefined);

  // Load from localStorage on mount
  useEffect(() => {
    if (!isActive) return;
    const saved = loadDraft(serviceId);
    if (saved) {
      setDraft(saved);
      // Restore scroll position
      if (saved.scrollPosition > 0) {
        requestAnimationFrame(() => {
          window.scrollTo(0, saved.scrollPosition);
        });
      }
    }
    initialized.current = true;
  }, [serviceId, isActive]);

  // Debounced save to localStorage on draft change
  useEffect(() => {
    if (!isActive || !initialized.current) return;
    clearTimeout(saveTimeout.current);
    saveTimeout.current = setTimeout(() => {
      saveDraft(serviceId, draft);
    }, 150);
    return () => clearTimeout(saveTimeout.current);
  }, [draft, serviceId, isActive]);

  // Save scroll position on scroll (throttled)
  useEffect(() => {
    if (!isActive) return;
    let ticking = false;
    const handler = () => {
      if (!ticking) {
        ticking = true;
        requestAnimationFrame(() => {
          setDraft((prev) => ({ ...prev, scrollPosition: window.scrollY }));
          ticking = false;
        });
      }
    };
    // Throttle to ~500ms
    const throttled = () => {
      handler();
    };
    let interval: ReturnType<typeof setInterval>;
    const scrollHandler = () => {
      if (!interval) {
        handler();
        interval = setInterval(() => {
          clearInterval(interval);
          interval = undefined as unknown as ReturnType<typeof setInterval>;
        }, 500);
      }
    };
    window.addEventListener("scroll", scrollHandler, { passive: true });
    return () => window.removeEventListener("scroll", scrollHandler);
  }, [isActive]);

  const updateChecklist = useCallback(
    (itemId: string, status: "done" | "pending" | "not_required") => {
      setDraft((prev) => ({
        ...prev,
        checklistState: { ...prev.checklistState, [itemId]: status },
      }));
    },
    []
  );

  const toggleCareAction = useCallback((typeId: string, done: boolean) => {
    setDraft((prev) => ({
      ...prev,
      careActionsDone: done
        ? [...prev.careActionsDone, typeId]
        : prev.careActionsDone.filter((id) => id !== typeId),
    }));
  }, []);

  const toggleSpecialTask = useCallback((taskId: string, done: boolean) => {
    setDraft((prev) => ({
      ...prev,
      specialTasksDone: done
        ? [...prev.specialTasksDone, taskId]
        : prev.specialTasksDone.filter((id) => id !== taskId),
    }));
  }, []);

  const updateIssue = useCallback((issueState: IssueState) => {
    setDraft((prev) => ({ ...prev, issueState }));
  }, []);

  const addIssuePhotoId = useCallback((photoId: string) => {
    setDraft((prev) => ({
      ...prev,
      issueState: {
        ...prev.issueState,
        photoIds: [...(prev.issueState.photoIds ?? []), photoId],
      },
    }));
  }, []);

  const setHasClientRequest = useCallback((value: boolean) => {
    setDraft((prev) => ({ ...prev, hasClientRequest: value }));
  }, []);

  return {
    draft,
    updateChecklist,
    toggleCareAction,
    toggleSpecialTask,
    updateIssue,
    addIssuePhotoId,
    setHasClientRequest,
  };
}
