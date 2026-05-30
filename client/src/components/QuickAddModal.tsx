import { useEffect, useRef, useState } from 'react';
import { Plus, Star } from 'lucide-react';
import type { AppState } from '../types';
import { useCreateTask, useCreateWorkstream } from '../state/queries';
import { useUI } from '../state/ui';
import { useToasts } from './Toast';
import { WorkstreamCreator } from './WorkstreamCreator';
import { Dropdown } from './Dropdown';

const NEW_WS_SENTINEL = '__new__';

export function QuickAddModal({ state }: { state: AppState }) {
  const setQuickAdd = useUI((s) => s.setQuickAdd);
  const createTask = useCreateTask();
  const createWorkstream = useCreateWorkstream();
  const pushToast = useToasts((s) => s.push);

  const sortedWs = [...state.workstreams].sort((a, b) => a.position - b.position);
  const misc = sortedWs.find((w) => w.is_misc);

  const [title, setTitle] = useState('');
  const [workstreamId, setWorkstreamId] = useState<string>(misc?.id ?? sortedWs[0]?.id ?? '');
  const [today, setToday] = useState(false);
  const [creatingWs, setCreatingWs] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const wsCountRef = useRef(state.workstreams.length);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    if (state.workstreams.length > wsCountRef.current) {
      const newest = [...state.workstreams].sort((a, b) => b.position - a.position)[0];
      if (newest) setWorkstreamId(newest.id);
      setCreatingWs(false);
    }
    wsCountRef.current = state.workstreams.length;
  }, [state.workstreams]);

  const close = () => setQuickAdd(false);

  const submit = () => {
    const v = title.trim();
    if (!v) return;
    createTask.mutate(
      { workstreamId, title: v, today },
      {
        onSuccess: () => close(),
        onError: (e) => pushToast(`Add failed: ${(e as Error).message}`, 'error'),
      }
    );
  };

  const handleCreateWs = (name: string, color: string) => {
    createWorkstream.mutate(
      { workspaceId: state.currentWorkspaceId ?? undefined, name, color },
      { onError: (e) => pushToast(`Create failed: ${(e as Error).message}`, 'error') }
    );
  };

  const selectedWs = sortedWs.find((w) => w.id === workstreamId);

  const options = [
    ...sortedWs.map((w) => ({ value: w.id, label: w.name, color: w.color })),
    { value: NEW_WS_SENTINEL, label: '+ New workstream…', color: undefined as string | undefined },
  ];

  return (
    <div className="modal-backdrop" onClick={close}>
      <div className="modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="New task">
        <div className="modal-body">
          <input
            ref={inputRef}
            className="title-input"
            placeholder="What needs to be done?"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') submit();
              if (e.key === 'Escape') close();
            }}
          />
          {creatingWs ? (
            <WorkstreamCreator
              autoFocus
              onCreate={handleCreateWs}
              onCancel={() => setCreatingWs(false)}
            />
          ) : (
            <div className="modal-row">
              <Dropdown<string>
                value={workstreamId}
                onChange={(v) => {
                  if (v === NEW_WS_SENTINEL) setCreatingWs(true);
                  else setWorkstreamId(v);
                }}
                triggerClassName="dd-trigger-ws"
                menuWidth={240}
                ariaLabel="Workstream"
                options={options}
                renderTrigger={(_sel, open) => (
                  <>
                    <span className="ws-swatch" style={{ background: selectedWs?.color ?? '#9CA3AF' }} />
                    <span className="ws-label">{selectedWs?.name ?? 'Workstream'}</span>
                    <Caret open={open} />
                  </>
                )}
              />
              <button
                className={`btn ${today ? 'btn-primary' : ''}`}
                onClick={() => setToday((v) => !v)}
                type="button"
              >
                <Star size={13} fill={today ? 'currentColor' : 'none'} />
                {today ? 'On Today' : 'Add to Today'}
              </button>
              <div style={{ flex: 1 }} />
              <button
                className="btn btn-ghost"
                type="button"
                onClick={() => setCreatingWs(true)}
                title="Create workstream"
              >
                <Plus size={13} /> Workstream
              </button>
            </div>
          )}
        </div>
        <div className="modal-footer">
          <span style={{ fontSize: 12, color: 'var(--text-faint)' }}>
            <span className="kbd">Enter</span> to add &nbsp;·&nbsp; <span className="kbd">Esc</span> to cancel
          </span>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn" onClick={close}>Cancel</button>
            <button className="btn btn-primary" onClick={submit} disabled={!title.trim() || creatingWs}>Add task</button>
          </div>
        </div>
      </div>
    </div>
  );
}

function Caret({ open }: { open: boolean }) {
  return (
    <svg
      className="dd-caret"
      width="12"
      height="12"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{ transform: open ? 'rotate(180deg)' : undefined, transition: 'transform 120ms' }}
    >
      <polyline points="6 9 12 15 18 9" />
    </svg>
  );
}
