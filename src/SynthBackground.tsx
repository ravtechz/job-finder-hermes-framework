/** Fundalul temei Synthwave: stele, două „valuri” luminoase și o grilă în perspectivă. Fix, în spatele conținutului,
 *  fără interacțiune. Valurile și grila sunt ascunse pe ecrane mici (vezi synthwave.css), ca să nu încarce telefoanele. */
export default function SynthBackground() {
  return (
    <div className="synth-bg" aria-hidden="true">
      <div className="synth-stars" />
      <div className="synth-floor">
        <div className="synth-wave synth-wave-a" />
        <div className="synth-wave synth-wave-b" />
        <div className="synth-fade" />
        <div className="synth-grid" />
      </div>
    </div>
  )
}
