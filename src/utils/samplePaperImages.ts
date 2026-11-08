/**
 * Utility to generate realistic, high-resolution SVG answer sheets for exam papers.
 * Ensures the examiner always sees authentic handwritten script pages with headers,
 * ruled lines, student solutions, equations, and diagrams instead of gray placeholders.
 */

export function generateSamplePaperSvg(
  rollNumber: string,
  studentName: string,
  subject: string,
  pageNumber: number,
  totalPages: number,
  variant: 'physics' | 'math' | 'chemistry' | 'cs' | 'biology' | 'default' = 'default'
): string {
  const content = getSubjectContent(variant, pageNumber);

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 1130" width="800" height="1130" style="background:#fcfbf7; font-family:'Courier New', monospace, serif;">
    <!-- Paper texture & margins -->
    <rect width="800" height="1130" fill="#fcfbf7"/>
    <defs>
      <pattern id="ruled-lines" width="800" height="28" patternUnits="userSpaceOnUse">
        <line x1="0" y1="28" x2="800" y2="28" stroke="#dbeafe" stroke-width="1" />
      </pattern>
    </defs>
    <!-- Ruled notebook lines starting below header -->
    <rect y="170" width="800" height="910" fill="url(#ruled-lines)" />
    <!-- Red left margin line -->
    <line x1="90" y1="0" x2="90" y2="1130" stroke="#fca5a5" stroke-width="1.5" />
    <line x1="94" y1="0" x2="94" y2="1130" stroke="#fecaca" stroke-width="0.8" />

    <!-- Official Examination Script Header Box -->
    <rect x="30" y="25" width="740" height="130" rx="8" fill="#ffffff" stroke="#94a3b8" stroke-width="1.5"/>
    <text x="400" y="52" text-anchor="middle" font-size="14" font-weight="bold" fill="#0f172a" letter-spacing="1">CENTRAL HIGHER SECONDARY BOARD — ANNUAL EXAMINATION 2026</text>
    <text x="400" y="70" text-anchor="middle" font-size="12" font-weight="600" fill="#334155">OFFICIAL CANDIDATE ANSWER SCRIPT</text>
    <line x1="30" y1="80" x2="770" y2="80" stroke="#cbd5e1" stroke-width="1"/>

    <!-- Candidate Header Fields (Simulated Handwriting in dark blue ink) -->
    <text x="45" y="102" font-size="11" font-weight="bold" fill="#475569">ROLL NO:</text>
    <text x="120" y="103" font-size="14" font-weight="bold" fill="#1e3a8a" font-family="'Caveat', 'Segoe Print', cursive, sans-serif">${rollNumber}</text>

    <text x="290" y="102" font-size="11" font-weight="bold" fill="#475569">CANDIDATE NAME:</text>
    <text x="420" y="103" font-size="14" font-weight="bold" fill="#1e3a8a" font-family="'Caveat', 'Segoe Print', cursive, sans-serif">${studentName}</text>

    <text x="45" y="130" font-size="11" font-weight="bold" fill="#475569">SUBJECT:</text>
    <text x="120" y="131" font-size="13" font-weight="bold" fill="#1e3a8a" font-family="'Caveat', 'Segoe Print', cursive, sans-serif">${subject}</text>

    <text x="560" y="130" font-size="11" font-weight="bold" fill="#64748b">PAGE ${pageNumber} OF ${totalPages}</text>

    <!-- Examiner Stamp Box -->
    <rect x="650" y="32" width="105" height="42" rx="4" fill="#f8fafc" stroke="#dc2626" stroke-width="1.2" stroke-dasharray="3 2"/>
    <text x="702" y="49" text-anchor="middle" font-size="9" font-weight="bold" fill="#dc2626">EXAMINER USE</text>
    <text x="702" y="65" text-anchor="middle" font-size="11" font-weight="bold" fill="#dc2626">AI SCRUTINY</text>

    <!-- Body Handwritten Content (Simulated ink) -->
    <g fill="#1e3a8a" font-family="'Caveat', 'Comic Sans MS', 'Segoe Print', cursive, sans-serif">
      ${content}
    </g>

    <!-- Paper Footer Page Stamp -->
    <text x="400" y="1110" text-anchor="middle" font-size="10" fill="#94a3b8" font-family="monospace">-- CONFIDENTIAL EXAMINATION SCRIPT — DO NOT TEAR --</text>
  </svg>`;

  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

function getSubjectContent(variant: string, page: number): string {
  if (variant === 'physics') {
    if (page === 1) {
      return `
        <!-- Section B Q2 (i) Answer -->
        <text x="40" y="210" font-size="15" font-weight="bold" fill="#0f172a">Ans 2 Part (i):</text>
        <text x="110" y="210" font-size="14">Dimensional consistency of S = vi t + 1/2 a t²:</text>
        <text x="110" y="235" font-size="14">[S] = [L];  [vi t] = [L T⁻¹] × [T] = [L];  [1/2 a t²] = [L T⁻²] × [T²] = [L]</text>
        <text x="110" y="260" font-size="14" font-weight="bold">LHS = [L] and RHS = [L] + [L] = [L]. Equation is dimensionally homogeneous.</text>

        <!-- Section B Q2 (ii) Answer -->
        <text x="40" y="315" font-size="15" font-weight="bold" fill="#0f172a">Ans 2 Part (ii):</text>
        <text x="110" y="315" font-size="14">Range of projectile R = (v₀² / g) sin(2θ). For maximum range R_max,</text>
        <text x="110" y="340" font-size="14">sin(2θ) must be maximum = 1  ⇒  2θ = 90°  ⇒  θ = 45° with horizontal.</text>

        <!-- Section B Q2 (iii) OR Answer: Student substituted 0.1 x 2 / 1 = 0.2 N -->
        <text x="40" y="405" font-size="15" font-weight="bold" fill="#0f172a">Ans 2 Part (iii) (OR):</text>
        <text x="110" y="405" font-size="14">Centripetal tension in string: T = m v² / r</text>
        <text x="110" y="430" font-size="14">Given: m = 0.1 kg, v = 2.0 m/s, r = 1.0 m</text>
        <text x="110" y="455" font-size="15" font-weight="bold" fill="#1e1b4b">T = 0.1 × 2 / 1 = 0.2 N</text>

        <!-- Section B Q2 (iv) OR Answer -->
        <text x="40" y="525" font-size="15" font-weight="bold" fill="#0f172a">Ans 2 Part (iv) (OR):</text>
        <text x="110" y="525" font-size="14">Law of Conservation of Linear Momentum:</text>
        <text x="110" y="550" font-size="14">Total linear momentum of an isolated system remains constant in time.</text>
        <text x="110" y="575" font-size="14" font-weight="bold">m₁ u₁ + m₂ u₂ = m₁ v₁ + m₂ v₂</text>

        <!-- Section B Q2 (v) Answer -->
        <text x="40" y="645" font-size="15" font-weight="bold" fill="#0f172a">Ans 2 Part (v):</text>
        <text x="110" y="645" font-size="14">Apparent weightlessness in satellite:</text>
        <text x="110" y="670" font-size="14">The spaceship and occupant are freely falling together toward Earth with g.</text>
        <text x="110" y="695" font-size="14">Apparent weight W_app = m(g - a) = m(g - g) = 0.</text>
      `;
    } else if (page === 2) {
      return `
        <!-- Section B Q2 (vi) OR Answer -->
        <text x="40" y="210" font-size="15" font-weight="bold" fill="#0f172a">Ans 2 Part (vi) (OR):</text>
        <text x="110" y="210" font-size="14">Terminal velocity vt: When drag force Fd = 6πηr vt equals weight mg = (4/3)πr³ρg</text>
        <text x="110" y="235" font-size="14" font-weight="bold">vt = (2 r² ρ g) / (9 η)</text>

        <!-- Section B Q2 (vii) OR Answer -->
        <text x="40" y="295" font-size="15" font-weight="bold" fill="#0f172a">Ans 2 Part (vii) (OR):</text>
        <text x="110" y="295" font-size="14">Translational K.E = (1/2) m v²  (motion along a line)</text>
        <text x="110" y="320" font-size="14">Rotational K.E = (1/2) I ω²  (where I is moment of inertia, ω is angular speed)</text>

        <!-- Section B Q2 (viii) Answer -->
        <text x="40" y="380" font-size="15" font-weight="bold" fill="#0f172a">Ans 2 Part (viii):</text>
        <text x="110" y="380" font-size="14">Conditions of equilibrium: 1st Condition: Σ F = 0;  2nd Condition: Σ τ = 0.</text>

        <!-- Section B Q2 (ix) OR Answer -->
        <text x="40" y="445" font-size="15" font-weight="bold" fill="#0f172a">Ans 2 Part (ix) (OR):</text>
        <text x="110" y="445" font-size="14">Newton formula: v = √(P/ρ) = 281 m/s (assumed isothermal).</text>
        <text x="110" y="470" font-size="14">Laplace correction: rapid compressions are adiabatic: v = √(γP/ρ) = 332 m/s.</text>

        <!-- Section B Q2 (x) Answer -->
        <text x="40" y="535" font-size="15" font-weight="bold" fill="#0f172a">Ans 2 Part (x):</text>
        <text x="110" y="535" font-size="14">Coherent sources maintain constant phase difference. Two independent lamps</text>
        <text x="110" y="560" font-size="14">emit light by spontaneous emission with random rapid phase jumps.</text>

        <!-- Section B Q2 (xii) Answer -->
        <text x="40" y="625" font-size="15" font-weight="bold" fill="#0f172a">Ans 2 Part (xii):</text>
        <text x="110" y="625" font-size="14">Astronomical Telescope: Magnifying power M = f₀ / fₑ.</text>

        <!-- Section B Q2 (xiii) Answer -->
        <text x="40" y="700" font-size="15" font-weight="bold" fill="#0f172a">Ans 2 Part (xiii):</text>
        <text x="110" y="700" font-size="14">Total Internal Reflection: Ray in denser medium when angle of incidence i &gt; critical angle c.</text>
        <!-- Note: Parts (xi) and (xiv) are left completely blank by candidate -->
      `;
    } else {
      return `
        <!-- Section C Q3 OR Answer: Rectangular components of vectors -->
        <text x="40" y="210" font-size="15" font-weight="bold" fill="#0f172a">Ans 3 (OR):</text>
        <text x="110" y="210" font-size="14" font-weight="bold">Addition of Vectors by Rectangular Components Method:</text>
        <text x="110" y="235" font-size="14">Let vectors A and B have components Ax, Ay and Bx, By in xy-plane.</text>
        <text x="110" y="260" font-size="14">Resultant x-component: Rx = Ax + Bx;  y-component: Ry = Ay + By</text>
        <text x="110" y="285" font-size="14">Resultant Vector: R = Rx i + Ry j</text>
        <text x="110" y="310" font-size="14" font-weight="bold">Magnitude: R = √(Rx² + Ry²);   Direction: θ = tan⁻¹(Ry / Rx)</text>

        <!-- Section C Q4 Answer: Work Energy Theorem -->
        <text x="40" y="380" font-size="15" font-weight="bold" fill="#0f172a">Ans 4:</text>
        <text x="110" y="380" font-size="14">Work-Energy Theorem: Work done W = F d = (m a) d.</text>
        <text x="110" y="405" font-size="14">Using 2ad = vf² - vi² ⇒ d = (vf² - vi²) / (2a)</text>
        <text x="110" y="430" font-size="14" font-weight="bold">W = m a [(vf² - vi²) / (2a)] = (1/2) m vf² - (1/2) m vi² = ΔK.E  [Proved]</text>

        <!-- Section C Q5 OR Answer: Mass-Spring System SHM -->
        <text x="40" y="500" font-size="15" font-weight="bold" fill="#0f172a">Ans 5 (OR):</text>
        <text x="110" y="500" font-size="14" font-weight="bold">Horizontal Mass-Spring System (SHM):</text>
        <text x="110" y="525" font-size="14">Restoring force F = -k x. By Newton's second law: m a = -k x ⇒ a = -(k/m) x.</text>
        <text x="110" y="550" font-size="14">Since acceleration a ∝ -x and directed towards mean position, motion is SHM.</text>
        <text x="110" y="575" font-size="14" font-weight="bold">Time Period T = 2π √(m/k);   Instantaneous Velocity v = ω √(x₀² - x²)</text>

        <!-- Section C Q6 OR Answer: Cp - Cv = R -->
        <text x="40" y="645" font-size="15" font-weight="bold" fill="#0f172a">Ans 6 (OR):</text>
        <text x="110" y="645" font-size="14" font-weight="bold">Relation between Molar Specific Heats (Cp - Cv = R):</text>
        <text x="110" y="670" font-size="14">First Law of Thermodynamics: dQ = dU + dW.</text>
        <text x="110" y="695" font-size="14">At constant volume: dW = 0 ⇒ dQv = n Cv dT = dU.</text>
        <text x="110" y="720" font-size="14">At constant pressure: dQp = n Cp dT = dU + P dV = n Cv dT + n R dT</text>
        <text x="110" y="745" font-size="15" font-weight="bold" fill="#1e1b4b">⇒ n Cp dT - n Cv dT = n R dT  ⇒  Cp - Cv = R  [Proved]</text>
      `;
    }
  }

  if (variant === 'math') {
    return `
      <!-- Q1 Eigenvalues -->
      <text x="40" y="210" font-size="15" font-weight="bold" fill="#0f172a">Ans 1.</text>
      <text x="110" y="210" font-size="15">Characteristic equation det(A - λI) = 0 for Hermitian Matrix:</text>
      <text x="110" y="238" font-size="14">| 2-λ   -1     0 |</text>
      <text x="110" y="266" font-size="14">| -1   2-λ    -1 | = 0  ⇒  (2-λ)[(2-λ)² - 1] - (-1)[-(2-λ)] = 0</text>
      <text x="110" y="294" font-size="14">|  0   -1    2-λ |</text>
      <text x="110" y="322" font-size="15">Solving cubic roots: λ₁ = 2, λ₂ = 2 + √2, λ₃ = 2 - √2.</text>
      <text x="110" y="350" font-size="15">All eigenvalues are purely real as guaranteed by spectral theorem.</text>

      <!-- Q2 Definite integral -->
      <text x="40" y="420" font-size="15" font-weight="bold" fill="#0f172a">Ans 2.</text>
      <text x="110" y="420" font-size="15">I = ∫₀^(π/2) [sin³x / (sin³x + cos³x)] dx   --- (1)</text>
      <text x="110" y="448" font-size="15">Using King's property: ∫₀^a f(x) dx = ∫₀^a f(a - x) dx:</text>
      <text x="110" y="476" font-size="15">I = ∫₀^(π/2) [cos³x / (cos³x + sin³x)] dx   --- (2)</text>
      <text x="110" y="504" font-size="15">Adding (1) + (2):  2I = ∫₀^(π/2) 1 dx = [x]₀^(π/2) = π/2</text>
      <text x="160" y="538" font-size="17" font-weight="bold">⇒ I = π / 4  [Answer]</text>

      <!-- Q3 Differential Eq -->
      <text x="40" y="600" font-size="15" font-weight="bold" fill="#0f172a">Ans 3.</text>
      <text x="110" y="600" font-size="15">y'' - 4y' + 4y = e^(2x). Auxiliary eqn: m² - 4m + 4 = 0 ⇒ (m - 2)² = 0</text>
      <text x="110" y="628" font-size="15">Complementary function: y_c = (c₁ + c₂ x) e^(2x)</text>
      <text x="110" y="656" font-size="15">Since 2 is double root, trial for y_p = A x² e^(2x)</text>
      <text x="110" y="684" font-size="15">y_p'' - 4 y_p' + 4 y_p = 2 A e^(2x) = e^(2x)  ⇒  A = 1/2</text>
      <text x="150" y="718" font-size="16" font-weight="bold">General Solution: y = (c₁ + c₂ x + 1/2 x²) e^(2x)</text>
    `;
  }

  // Default subject template with realistic student answers
  return `
    <!-- Q1 Answer -->
    <text x="40" y="210" font-size="15" font-weight="bold" fill="#0f172a">Ans 1.</text>
    <text x="110" y="210" font-size="15">Primary theoretical principles and formal definitions are established.</text>
    <text x="110" y="238" font-size="15">Step 1: Governing conditions satisfy boundary limits [ILLEGIBLE] at origin.</text>
    <text x="110" y="266" font-size="15">Step 2: Differential formulation yields standard characteristic roots.</text>
    <text x="150" y="300" font-size="16" font-weight="bold">Result proven accurately with verification coefficient K = 1.414</text>

    <!-- Q2 Answer -->
    <text x="40" y="360" font-size="15" font-weight="bold" fill="#0f172a">Ans 2.</text>
    <text x="110" y="360" font-size="15">Analytical procedure executed with full intermediate derivation:</text>
    <text x="110" y="388" font-size="15">Summation over all discrete nodes: Σ F_i = m a_c</text>
    <text x="110" y="416" font-size="15">Conservation laws hold under frictionless adiabatic constraints.</text>

    <!-- Q3 Answer with diagram -->
    <text x="40" y="480" font-size="15" font-weight="bold" fill="#0f172a">Ans 3.</text>
    <text x="110" y="480" font-size="15">Experimental arrangement and component setup schematic:</text>
    <g stroke="#1e3a8a" stroke-width="2" fill="none">
      <rect x="150" y="510" width="180" height="90" rx="6" fill="#f8fafc"/>
      <line x1="240" y1="510" x2="240" y2="600" stroke-dasharray="4 2"/>
      <circle cx="240" cy="555" r="22" fill="#e0f2fe"/>
    </g>
    <text x="350" y="550" font-size="13" font-weight="bold">Central Chamber / Core Matrix</text>
    <text x="350" y="575" font-size="12">Flow rate monitored at 5.0 mL/s</text>
    <text x="110" y="640" font-size="15">Calculations align with established theoretical benchmarks.</text>
  `;
}
