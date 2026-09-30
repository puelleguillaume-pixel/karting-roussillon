import { useId, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react';
import { cx } from '@/lib/cx';

interface FieldShellProps {
  id: string;
  label: ReactNode;
  hint?: ReactNode;
  error?: string;
  required?: boolean;
  className?: string;
  children: ReactNode;
}

function FieldShell({ id, label, hint, error, required, className, children }: FieldShellProps) {
  return (
    <div className={cx('flex flex-col gap-1.5', className)}>
      <label htmlFor={id} className="text-sm font-semibold text-chalk">
        {label}
        {required ? (
          <span className="ml-1 text-race-400" aria-hidden>
            *
          </span>
        ) : (
          <span className="ml-1.5 font-normal text-asphalt-400">(facultatif)</span>
        )}
      </label>
      {children}
      {hint && !error && (
        <p id={`${id}-hint`} className="text-xs text-asphalt-400">
          {hint}
        </p>
      )}
      {error && (
        <p id={`${id}-error`} className="text-sm font-medium text-race-400">
          {error}
        </p>
      )}
    </div>
  );
}

const CONTROL =
  'w-full rounded-none border border-asphalt-600 bg-asphalt-900 px-3.5 py-3 text-base text-chalk placeholder:text-asphalt-500 transition-colors focus:border-race-400 focus:outline-none focus-visible:outline-2 focus-visible:outline-offset-0 focus-visible:outline-race-400 aria-invalid:border-race-400';

function describedBy(id: string, hint?: ReactNode, error?: string) {
  return cx(error ? `${id}-error` : hint ? `${id}-hint` : undefined) || undefined;
}

type BaseProps = { label: ReactNode; hint?: ReactNode; error?: string; className?: string };

export function TextField({ label, hint, error, className, required, id: idProp, ...props }: BaseProps & InputHTMLAttributes<HTMLInputElement>) {
  const autoId = useId();
  const id = idProp ?? autoId;
  return (
    <FieldShell id={id} label={label} hint={hint} error={error} required={required} className={className}>
      <input
        id={id}
        required={required}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy(id, hint, error)}
        className={CONTROL}
        {...props}
      />
    </FieldShell>
  );
}

export function TextAreaField({ label, hint, error, className, required, id: idProp, ...props }: BaseProps & TextareaHTMLAttributes<HTMLTextAreaElement>) {
  const autoId = useId();
  const id = idProp ?? autoId;
  return (
    <FieldShell id={id} label={label} hint={hint} error={error} required={required} className={className}>
      <textarea
        id={id}
        required={required}
        rows={5}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy(id, hint, error)}
        className={cx(CONTROL, 'min-h-32 resize-y')}
        {...props}
      />
    </FieldShell>
  );
}

export function SelectField({
  label,
  hint,
  error,
  className,
  required,
  id: idProp,
  children,
  ...props
}: BaseProps & SelectHTMLAttributes<HTMLSelectElement>) {
  const autoId = useId();
  const id = idProp ?? autoId;
  return (
    <FieldShell id={id} label={label} hint={hint} error={error} required={required} className={className}>
      <select
        id={id}
        required={required}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy(id, hint, error)}
        className={cx(CONTROL, 'appearance-none bg-[length:1rem] bg-[right_0.9rem_center] bg-no-repeat pr-10')}
        style={{
          backgroundImage:
            "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%23b4b8c0' stroke-width='2'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E\")",
        }}
        {...props}
      >
        {children}
      </select>
    </FieldShell>
  );
}

export function CheckboxField({ label, error, className, id: idProp, ...props }: Omit<BaseProps, 'hint'> & InputHTMLAttributes<HTMLInputElement>) {
  const autoId = useId();
  const id = idProp ?? autoId;
  return (
    <div className={cx('flex flex-col gap-1', className)}>
      <div className="flex items-start gap-3">
        <input
          id={id}
          type="checkbox"
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${id}-error` : undefined}
          className="mt-0.5 size-5 shrink-0 accent-race-600"
          {...props}
        />
        <label htmlFor={id} className="text-sm text-asphalt-200">
          {label}
        </label>
      </div>
      {error && (
        <p id={`${id}-error`} className="text-sm font-medium text-race-400">
          {error}
        </p>
      )}
    </div>
  );
}
