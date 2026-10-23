import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';

interface Props<T> {
  items: T[];
  rowHeight: number;
  renderRow: (item: T, index: number) => React.ReactNode;
  selectedIndex?: number;
  /** Remember scrollTop across unmounts (list -> detail -> back). */
  scrollMemory?: React.MutableRefObject<number>;
  empty?: React.ReactNode;
}

/** Minimal fixed-row-height windowing so 200+ entries stay smooth. */
export function VirtualList<T>({ items, rowHeight, renderRow, selectedIndex, scrollMemory, empty }: Props<T>) {
  const ref = useRef<HTMLDivElement>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [height, setHeight] = useState(300);

  const isEmpty = items.length === 0;

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (scrollMemory) el.scrollTop = scrollMemory.current;
    setHeight(el.clientHeight);
    const ro = new ResizeObserver(() => setHeight(el.clientHeight));
    ro.observe(el);
    return () => ro.disconnect();
  }, [scrollMemory, isEmpty]);

  useEffect(() => {
    const el = ref.current;
    if (!el || selectedIndex == null || selectedIndex < 0) return;
    const top = selectedIndex * rowHeight;
    if (top < el.scrollTop) el.scrollTop = top;
    else if (top + rowHeight > el.scrollTop + el.clientHeight) el.scrollTop = top + rowHeight - el.clientHeight;
  }, [selectedIndex, rowHeight]);

  if (!items.length) return <div className="ndt-empty">{empty}</div>;

  const start = Math.max(0, Math.floor(scrollTop / rowHeight) - 6);
  const end = Math.min(items.length, Math.ceil((scrollTop + height) / rowHeight) + 6);

  return (
    <div
      ref={ref}
      className="ndt-vlist"
      role="listbox"
      onScroll={(e) => {
        const t = e.currentTarget.scrollTop;
        if (scrollMemory) scrollMemory.current = t;
        setScrollTop(t);
      }}
    >
      <div style={{ height: items.length * rowHeight, position: 'relative' }}>
        {items.slice(start, end).map((item, i) => (
          <div key={start + i} className="ndt-vrow" style={{ top: (start + i) * rowHeight, height: rowHeight }}>
            {renderRow(item, start + i)}
          </div>
        ))}
      </div>
    </div>
  );
}
