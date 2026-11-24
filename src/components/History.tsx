import type { History as HistoryData, Player } from '../game/rules'
import { weekLabel } from '../lib/format'

function verdict(r: HistoryData['rows'][number], me: Player) {
  const who = (p: Player) => (p === me ? 'You' : p)
  if (r.current) {
    if (r.aleem + r.nurul === 0) return 'Just started'
    return r.winner === 'tie' ? 'Neck and neck so far' : `${who(r.winner)} leading so far`
  }
  if (r.winner === 'tie') return 'A tie. Same brain.'
  return `🏆 ${who(r.winner)} missed more`
}

export function History({ data, me, onBack }: { data: HistoryData; me: Player; onBack(): void }) {
  const { rows, trophies, allTime, streak } = data
  const finished = rows.filter((r) => !r.current).length
  return (
    <section className="history" aria-labelledby="history-title">
      <div className="history-top">
        <button className="link back" onClick={onBack}>← back to the rope</button>
        <h2 id="history-title">History</h2>
      </div>

      <div className="card history-summary">
        <div className="trophy-row">
          {(['Aleem', 'Nurul'] as const).map((p) => (
            <div key={p} className={`trophy trophy-${p.toLowerCase()}`}>
              <span className="trophy-count" data-testid={`trophies-${p}`}>🏆 {trophies[p]}</span>
              <span className="trophy-name">{p}{p === me && ' (you)'}</span>
              <small>{allTime[p]} pts all time</small>
            </div>
          ))}
        </div>
        <p className="history-line">
          {finished === 0
            ? 'The first season ends Sunday at midnight.'
            : streak && streak.weeks > 1
              ? `${streak.player === me ? 'You have' : `${streak.player} has`} won ${streak.weeks} weeks in a row`
              : `${finished} season${finished > 1 ? 's' : ''} played`}
        </p>
      </div>

      {rows.length === 0 ? (
        <p className="muted center-text">No seasons yet. Go miss someone.</p>
      ) : (
        <ol className="weeks">
          {rows.map((r) => {
            const total = r.aleem + r.nurul
            const aleemShare = total === 0 ? 50 : (r.aleem / total) * 100
            return (
              <li key={r.week_start} className={`card week${r.current ? ' current' : ''} won-${r.winner.toLowerCase()}`} data-testid="week">
                <div className="week-head">
                  <span>Week of {weekLabel(r.week_start)}</span>
                  {r.current && <span className="live-tag">this week</span>}
                </div>
                <p className="week-verdict">{verdict(r, me)}</p>
                <div className="week-score">
                  <b className="a">{r.aleem}</b>
                  <div className="tug-bar" role="img" aria-label={`Aleem ${r.aleem}, Nurul ${r.nurul}`}>
                    <span style={{ width: `${aleemShare}%` }} />
                  </div>
                  <b className="n">{r.nurul}</b>
                </div>
                <ul className="week-stats">
                  <li>♥ {r.aleem_misses} vs {r.nurul_misses} misses</li>
                  {r.same_brains > 0 && <li>🧠 {r.same_brains} Same Brain{r.same_brains > 1 ? 's' : ''}</li>}
                  {r.longest_rally > 1 && <li>🏓 rally of {r.longest_rally}</li>}
                  {r.aleem_proven + r.nurul_proven > 0 && <li>🔍 {r.aleem_proven} vs {r.nurul_proven} proven</li>}
                  {r.aleem_bluffs + r.nurul_bluffs > 0 && <li>🤥 bluffs {r.aleem_bluffs}–{r.nurul_bluffs}</li>}
                  {r.aleem_duels + r.nurul_duels > 0 && <li>⚔️ duels {r.aleem_duels}–{r.nurul_duels}</li>}
                </ul>
              </li>
            )
          })}
        </ol>
      )}
    </section>
  )
}
