interface ScoreCardProps {
  label: string;
  score: number;
  /** When true, a higher score means lower risk (risk categories). */
  isRiskCategory?: boolean;
}

function scoreClass(score: number): string {
  if (score >= 75) return 'score-high';
  if (score >= 50) return 'score-mid';
  return 'score-low';
}

export function ScoreCard({ label, score, isRiskCategory }: ScoreCardProps) {
  return (
    <div className="score-card">
      <div className="score-card-header">
        <span className="score-card-label">{label}</span>
        <span className={`score-card-value ${scoreClass(score)}`}>{score}</span>
      </div>
      <div className="score-bar">
        <div
          className={`score-bar-fill ${scoreClass(score)}`}
          style={{ width: `${Math.min(100, Math.max(0, score))}%` }}
        />
      </div>
      {isRiskCategory && <div className="score-card-hint">higher = lower risk</div>}
    </div>
  );
}
