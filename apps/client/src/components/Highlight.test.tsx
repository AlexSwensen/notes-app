import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import { Highlight } from './Highlight';

const marks = (container: HTMLElement) =>
  [...container.querySelectorAll('mark')].map((m) => m.textContent);

describe('Highlight', () => {
  it('renders plain text when there are no terms', () => {
    const { container } = render(<Highlight text="Hello world" terms={[]} />);
    expect(container.textContent).toBe('Hello world');
    expect(marks(container)).toEqual([]);
  });

  it('wraps every case-insensitive match in <mark>', () => {
    const { container } = render(<Highlight text="Eggs, more eggs, EGGS" terms={['eggs']} />);
    expect(marks(container)).toEqual(['Eggs', 'eggs', 'EGGS']);
    expect(container.textContent).toBe('Eggs, more eggs, EGGS');
  });

  it('highlights several terms', () => {
    const { container } = render(<Highlight text="milk and bread" terms={['milk', 'bread']} />);
    expect(marks(container)).toEqual(['milk', 'bread']);
  });

  it('treats regex characters in terms literally', () => {
    const { container } = render(
      <Highlight text="costs $5 (approx.)" terms={['$5', '(approx.)']} />,
    );
    expect(marks(container)).toEqual(['$5', '(approx.)']);
  });
});
