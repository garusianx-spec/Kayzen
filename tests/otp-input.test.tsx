import { fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { OtpInput } from '@/components/auth/OtpInput';

/**
 * The OTP field is the one component where a small regression costs a user
 * their sign-in, so the attributes that drive OS autofill are asserted
 * explicitly: without `autocomplete="one-time-code"` the keyboard suggestion
 * disappears and WebOTP has nothing to fill.
 */

function Harness({ onComplete }: { onComplete?: (value: string) => void }) {
  const [value, setValue] = useState('');
  return <OtpInput value={value} onChange={setValue} onComplete={onComplete} autoFocus={false} />;
}

describe('OtpInput', () => {
  it('carries the attributes that make SMS autofill work', () => {
    render(<Harness />);
    const input = screen.getByLabelText('کد تأیید پیامک‌شده');

    expect(input).toHaveAttribute('autocomplete', 'one-time-code');
    expect(input).toHaveAttribute('inputmode', 'numeric');
    expect(input).toHaveAttribute('maxlength', '6');
  });

  it('normalises Persian digits to ASCII', () => {
    render(<Harness />);
    const input = screen.getByLabelText('کد تأیید پیامک‌شده') as HTMLInputElement;

    fireEvent.change(input, { target: { value: '۱۲۳۴۵۶' } });
    expect(input.value).toBe('123456');
  });

  it('drops non-digits and respects the length cap', () => {
    render(<Harness />);
    const input = screen.getByLabelText('کد تأیید پیامک‌شده') as HTMLInputElement;

    fireEvent.change(input, { target: { value: '12ab34-56789' } });
    expect(input.value).toBe('123456');
  });

  it('fires onComplete exactly once when the field fills', () => {
    const onComplete = vi.fn();
    render(<Harness onComplete={onComplete} />);
    const input = screen.getByLabelText('کد تأیید پیامک‌شده');

    fireEvent.change(input, { target: { value: '123456' } });
    expect(onComplete).toHaveBeenCalledTimes(1);
    expect(onComplete).toHaveBeenCalledWith('123456');
  });

  it('renders one cell per digit, in Persian', () => {
    render(<Harness />);
    const input = screen.getByLabelText('کد تأیید پیامک‌شده');

    fireEvent.change(input, { target: { value: '12' } });
    expect(screen.getByText('۱')).toBeInTheDocument();
    expect(screen.getByText('۲')).toBeInTheDocument();
  });
});
