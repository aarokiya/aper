'use client';

import { type SyntheticEvent, useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

export function CourseAliasEditor({
  courseId,
  officialCode,
  initialAlias,
}: {
  courseId: number;
  officialCode: string;
  initialAlias: string | null;
}) {
  const [open, setOpen] = useState(false);
  const [alias, setAlias] = useState(initialAlias ?? '');
  const [saving, setSaving] = useState(false);
  const submit = async (event: SyntheticEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSaving(true);
    try {
      const response = await fetch(`/api/courses/${courseId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ alias: alias.trim() || null }),
      });
      if (!response.ok) throw new Error('Unable to save alias');
      setOpen(false);
      window.location.reload();
    } finally {
      setSaving(false);
    }
  };
  return (
    <>
      <Button onClick={() => setOpen(true)} variant="outline">
        Edit alias
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Course alias</DialogTitle>
            <DialogDescription>
              A short local label for this class. Canvas keeps its official
              code, {officialCode}.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={submit}>
            <label className="block text-[0.8125rem] text-ink-2">
              Alias
              <input
                value={alias}
                onChange={(event) => setAlias(event.target.value)}
                placeholder={officialCode}
                maxLength={80}
                className="field mt-1.5"
              />
            </label>
            <DialogFooter className="mt-6">
              <Button
                type="button"
                onClick={() => setOpen(false)}
                variant="link"
              >
                Cancel
              </Button>
              <Button type="submit" disabled={saving}>
                {saving ? 'Saving…' : 'Save alias'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
