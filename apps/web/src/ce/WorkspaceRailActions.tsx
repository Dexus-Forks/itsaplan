'use client';

import { useState } from 'react';
import { Plus } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useWorkspaceCreationQuery } from '@/services/workspaces.service';
import { workspacePath } from '@/utils/paths';
import WorkspaceCreateModal from '@/components/common/workspaces/WorkspaceCreateModal';
import { workspaceRowClass, workspaceTileClass } from '@/components/layout/utils/workspaceTile';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

type Phase = 'idle' | 'checking' | 'create' | 'restricted' | 'limit' | 'error';

export default function WorkspaceRailActions({ variant = 'tile' }: { variant?: 'tile' | 'row' }) {
  const t = useTranslations('teams.workspace');
  const router = useRouter();
  const availability = useWorkspaceCreationQuery();
  const [phase, setPhase] = useState<Phase>('idle');
  const checking = phase === 'checking';

  async function start() {
    setPhase('checking');
    const result = await availability.refetch();
    if (result.isError || !result.data) setPhase('error');
    else if (result.data.allowed) setPhase('create');
    else setPhase(result.data.reason ?? 'restricted');
  }

  let message = '';
  if (phase === 'restricted') message = t('creationRestricted');
  if (phase === 'limit') message = t('creationLimit');
  if (phase === 'error') message = t('creationFailed');

  return (
    <>
      <Popover
        open={phase === 'restricted' || phase === 'limit' || phase === 'error'}
        onOpenChange={(open) => {
          if (!open) setPhase('idle');
        }}
      >
        {variant === 'row' ? (
          <PopoverTrigger asChild>
            <Button
              variant="ghost"
              className={`${workspaceRowClass} text-muted-foreground`}
              disabled={checking}
              aria-busy={checking}
              onClick={start}
            >
              <span
                aria-hidden
                className="flex size-6 shrink-0 items-center justify-center rounded-md border border-dashed"
              >
                <Plus className="size-3.5" />
              </span>
              {t('create')}
            </Button>
          </PopoverTrigger>
        ) : (
          <Tooltip>
            <TooltipTrigger asChild>
              <PopoverTrigger asChild>
                <button
                  type="button"
                  aria-label={t('create')}
                  className={workspaceTileClass(false)}
                  disabled={checking}
                  aria-busy={checking}
                  onClick={start}
                >
                  <Plus className="size-4" />
                </button>
              </PopoverTrigger>
            </TooltipTrigger>
            <TooltipContent side="right">{t('create')}</TooltipContent>
          </Tooltip>
        )}
        <PopoverContent
          side={variant === 'row' ? 'bottom' : 'right'}
          align="start"
          className="w-64 text-sm"
        >
          <p role={phase === 'error' ? 'alert' : undefined}>{message}</p>
          {phase === 'error' && (
            <Button variant="outline" className="mt-3" onClick={start}>
              {t('creationRetry')}
            </Button>
          )}
        </PopoverContent>
      </Popover>
      {phase === 'create' && (
        <WorkspaceCreateModal
          onClose={() => setPhase('idle')}
          onCreated={(workspace) => router.push(workspacePath(workspace.id, 'info'))}
        />
      )}
    </>
  );
}
