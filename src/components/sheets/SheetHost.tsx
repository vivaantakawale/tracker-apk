import { useEffect } from 'react';
import { useUI } from '../../state/ui';
import { DaySheet, EntryDetailsSheet, EntryFormSheet } from './EntrySheets';
import { GoalFormSheet, PhaseFormSheet } from './GoalPhaseSheets';
import { ConfirmSheet, HeightSheet, RestoreSheet } from './MiscSheets';

/** Renders the stack of open sheets; only the top one receives focus. */
export function SheetHost() {
  const { sheets, close } = useUI();

  useEffect(() => {
    document.body.style.overflow = sheets.length ? 'hidden' : '';
  }, [sheets.length]);

  return (
    <>
      {sheets.map(({ id, spec }) => {
        const onClose = () => close(id);
        switch (spec.kind) {
          case 'entry-form':
            return <EntryFormSheet key={id} entryId={spec.entryId} dateKey={spec.dateKey} onClose={onClose} />;
          case 'entry-details':
            return <EntryDetailsSheet key={id} entryId={spec.entryId} onClose={onClose} />;
          case 'day':
            return <DaySheet key={id} dateKey={spec.dateKey} onClose={onClose} />;
          case 'goal-form':
            return <GoalFormSheet key={id} goalId={spec.goalId} onClose={onClose} />;
          case 'phase-form':
            return <PhaseFormSheet key={id} phaseId={spec.phaseId} onClose={onClose} />;
          case 'height':
            return <HeightSheet key={id} onClose={onClose} />;
          case 'restore':
            return <RestoreSheet key={id} backup={spec.backup} fileName={spec.fileName} onClose={onClose} />;
          case 'confirm':
            return (
              <ConfirmSheet
                key={id}
                title={spec.title}
                message={spec.message}
                confirmLabel={spec.confirmLabel}
                destructive={spec.destructive}
                onResolve={(ok) => {
                  spec.resolve(ok);
                  close(id);
                }}
              />
            );
        }
      })}
    </>
  );
}
