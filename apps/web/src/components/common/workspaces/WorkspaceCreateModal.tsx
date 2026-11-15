'use client';

import { useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import type { Workspace } from '@/lib/api/endpoints/workspaces';
import { useCreateWorkspace } from '@/services/workspaces.service';
import Modal from '@/components/common/overlay/Modal';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export default function WorkspaceCreateModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (workspace: Workspace) => void;
}) {
  const t = useTranslations('teams.workspace.createDialog');
  const common = useTranslations('common');
  const create = useCreateWorkspace();
  const [name, setName] = useState('');
  const submitting = useRef(false);
  const normalized = name.trim();
  const valid = normalized.length > 0 && normalized.length <= 60;

  function close() {
    if (!submitting.current) onClose();
  }

  function submit() {
    if (!valid || submitting.current) return;
    submitting.current = true;
    create.mutate(
      { name: normalized },
      {
        onSuccess: (workspace) => {
          toast.success(t('created'));
          onClose();
          onCreated(workspace);
        },
        onSettled: () => {
          submitting.current = false;
        },
      },
    );
  }

  return (
    <Modal title={t('title')} description={t('hint')} onClose={close}>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          submit();
        }}
      >
        <div className="space-y-2">
          <Label htmlFor="new-workspace-name">{t('name')}</Label>
          <Input
            id="new-workspace-name"
            autoFocus
            dir={name ? 'auto' : undefined}
            value={name}
            aria-invalid={name !== '' && !valid}
            aria-describedby="new-workspace-name-hint"
            onChange={(event) => setName(event.target.value)}
            onKeyDown={(event) => {
              if (event.key !== 'Enter') return;
              event.preventDefault();
              if (!event.nativeEvent.isComposing) submit();
            }}
          />
          <p id="new-workspace-name-hint" className="text-xs text-muted-foreground">
            {t('nameHint')}
          </p>
        </div>
        <div className="mt-4 flex justify-end gap-2 border-t pt-3">
          <Button type="button" variant="outline" onClick={close} disabled={create.isPending}>
            {common('cancel')}
          </Button>
          <Button type="submit" disabled={!valid || create.isPending}>
            {create.isPending ? common('saving') : t('submit')}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
