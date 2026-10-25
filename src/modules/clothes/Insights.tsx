import type { ReactNode } from 'react';

export type Tone = 'lime' | 'blue' | 'purple' | 'orange';

export interface Insight {
  value: string;
  label: string;
  tone: Tone;
  icon: ReactNode;
}

/** Two-column tiles with a coloured icon, shared by the item and outfit pages. */
export function Insights({ insights }: { insights: Insight[] }) {
  return (
    <section>
      <h2>Insights</h2>
      <ul className="insights">
        {insights.map(({ value, label, tone, icon }) => (
          <li key={label} className="card">
            <span className="insight-value">{value}</span>
            <span className="insight-foot">
              <span className="stat-label">{label}</span>
              <span className={`insight-icon tone-${tone}`}>{icon}</span>
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
