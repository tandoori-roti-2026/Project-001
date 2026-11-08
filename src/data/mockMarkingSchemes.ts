export interface MarkingRubricLevel {
  id: string;
  levelNumber: number; // 1, 2, 3, 4...
  title?: string; // e.g. "Level 1 (Full Marks)"
  description: string;
  marks: number; // Supports fractional marks e.g. 1.5, 0.5, 0
}

export interface MarkingKeyPoint {
  id: string;
  description: string;
  marks: number;
}

export interface MarkingSubPart {
  id: string;
  partLabel: string; // e.g. "(i)", "(ii)", "(a)", "(b)"
  partText: string;
  maxMarks: number;
  mode: 'key_points' | 'rubric_levels';
  modelAnswer?: string;
  alternativeNotes?: string;
  keyPoints?: MarkingKeyPoint[];
  rubricLevels?: MarkingRubricLevel[];
}

export interface MarkingOrOption {
  questionText: string;
  maxMarks: number;
  modelAnswer: string;
  mode: 'key_points' | 'rubric_levels';
  alternativeNotes?: string;
  keyPoints?: MarkingKeyPoint[];
  rubricLevels?: MarkingRubricLevel[];
  hasSubParts?: boolean;
  subParts?: MarkingSubPart[];
}

export interface MarkingQuestionScheme {
  id: string;
  questionNumber: number;
  partLabel?: string;
  section?: string;
  questionText: string;
  maxMarks: number;
  modelAnswer: string;
  mode: 'key_points' | 'rubric_levels';
  questionType?: 'mcq' | 'descriptive' | 'subjective' | 'rubric' | 'short' | 'long';
  type?: 'mcq' | 'descriptive' | 'subjective' | 'rubric' | 'short' | 'long';
  keyPoints?: MarkingKeyPoint[];
  rubricLevels?: MarkingRubricLevel[];
  hasSubParts?: boolean;
  subParts?: MarkingSubPart[];
  hasOrChoice?: boolean;
  orChoice?: MarkingOrOption;
  alternativeNotes?: string;
}

export interface MarkingScheme {
  id: string;
  subject: string;
  examSession: string;
  shift?: 'morning' | 'evening' | 'both';
  title: string;
  description?: string;
  totalMarks: number;
  questions: MarkingQuestionScheme[];
  updatedAt: string;
}

export const ensureDescriptiveSchemeQuestions = (scheme: MarkingScheme): MarkingScheme => {
  if (!scheme || !Array.isArray(scheme.questions)) return scheme;

  const isMathOrImported =
    (scheme.title || '').toLowerCase().includes('math') ||
    (scheme.subject || '').toLowerCase().includes('math') ||
    (scheme.title || '').toLowerCase().includes('chem') ||
    (scheme.subject || '').toLowerCase().includes('chem') ||
    (scheme.title || '').toLowerCase().includes('sep 29') ||
    (scheme.title || '').toLowerCase().includes('imported') ||
    scheme.questions.some(
      (q) => q.questionType === 'descriptive' || q.type === 'descriptive' || q.questionType === 'rubric' || q.section === 'B' || q.section === 'C'
    );

  const updatedQuestions = scheme.questions.map((q) => {
    const isDescriptive =
      isMathOrImported ||
      q.questionType === 'descriptive' ||
      q.type === 'descriptive' ||
      q.questionType === 'subjective' ||
      q.questionType === 'rubric' ||
      (q as any).isMcq === false;

    if (!isDescriptive) {
      return q;
    }

    const max = Number(q.maxMarks) || 4;
    let modelAns = q.modelAnswer || '';
    if (!modelAns || modelAns.startsWith('Correct Option:')) {
      modelAns = `Complete step-by-step mathematical derivation / descriptive solution for Question ${q.questionNumber} showing all working steps, formulas, and final answer statement.`;
    }

    const hasOptionRubric = q.rubricLevels?.some(
      (l) => l.title?.includes('Option') || l.description?.includes('Selected option')
    );
    let rubricLevels = q.rubricLevels;

    if (!rubricLevels || rubricLevels.length === 0 || hasOptionRubric) {
      rubricLevels = [
        {
          id: `${q.id || q.questionNumber}-l1`,
          levelNumber: 1,
          title: `Level 1 (${max} Marks)`,
          description: 'Complete and accurate step-by-step solution with all working steps and correct final answer.',
          marks: max,
        },
        {
          id: `${q.id || q.questionNumber}-l2`,
          levelNumber: 2,
          title: `Level 2 (${Math.round(max * 0.75 * 10) / 10} Marks)`,
          description: 'Substantially correct method with minor calculation or algebraic error.',
          marks: Math.round(max * 0.75 * 10) / 10,
        },
        {
          id: `${q.id || q.questionNumber}-l3`,
          levelNumber: 3,
          title: `Level 3 (${Math.round(max * 0.5 * 10) / 10} Marks)`,
          description: 'Partial working or stating relevant formula/concept.',
          marks: Math.round(max * 0.5 * 10) / 10,
        },
        {
          id: `${q.id || q.questionNumber}-l4`,
          levelNumber: 4,
          title: 'Level 4 (0 Marks)',
          description: 'Incorrect, blank, or irrelevant response.',
          marks: 0,
        },
      ];
    }
    let orChoiceObj = q.orChoice;
    if (q.hasOrChoice) {
      const orMax = Number(q.orChoice?.maxMarks) || max;
      let orModelAns = q.orChoice?.modelAnswer || '';
      if (!orModelAns || orModelAns === modelAns) {
        orModelAns = `Distinct model answer & step-by-step evaluation rubric for OR Alternative of Question ${q.questionNumber}.`;
      }
      let orRubricLevels = q.orChoice?.rubricLevels;
      if (!orRubricLevels || orRubricLevels.length === 0) {
        orRubricLevels = [
          {
            id: `${q.id || q.questionNumber}-or-l1`,
            levelNumber: 1,
            title: `Level 1 (${orMax} Marks)`,
            description: 'Complete and accurate step-by-step solution for OR choice.',
            marks: orMax,
          },
          {
            id: `${q.id || q.questionNumber}-or-l2`,
            levelNumber: 2,
            title: `Level 2 (${Math.round(orMax * 0.67 * 10) / 10} Marks)`,
            description: 'Substantially correct method for OR choice with minor error.',
            marks: Math.round(orMax * 0.67 * 10) / 10,
          },
          {
            id: `${q.id || q.questionNumber}-or-l3`,
            levelNumber: 3,
            title: `Level 3 (${Math.round(orMax * 0.33 * 10) / 10} Marks)`,
            description: 'Partial working or stating relevant formula for OR choice.',
            marks: Math.round(orMax * 0.33 * 10) / 10,
          },
          {
            id: `${q.id || q.questionNumber}-or-l4`,
            levelNumber: 4,
            title: 'Level 4 (0 Marks)',
            description: 'Incorrect, blank, or irrelevant response for OR choice.',
            marks: 0,
          },
        ];
      }
      orChoiceObj = {
        questionText: q.orChoice?.questionText || `Alternative OR Question ${q.questionNumber} statement...`,
        maxMarks: orMax,
        modelAnswer: orModelAns,
        mode: 'rubric_levels' as const,
        rubricLevels: orRubricLevels,
      };
    }

    return {
      ...q,
      questionType: 'descriptive' as const,
      type: 'descriptive' as const,
      mode: 'rubric_levels' as const,
      modelAnswer: modelAns,
      rubricLevels,
      orChoice: orChoiceObj,
    };
  });

  return {
    ...scheme,
    questions: updatedQuestions,
  };
};

// Initial state with official FBISE Physics HSSC-I 68-mark scheme
export const INITIAL_MOCK_MARKING_SCHEMES: MarkingScheme[] = [
  {
    id: 'Physics (Advanced)_Morning (Group 1)',
    subject: 'Physics (Advanced)',
    examSession: 'Annual Senior Examinations 2026',
    shift: 'morning',
    title: 'Physics Morning',
    description: 'FBISE official 68-mark rubric scheme for Physics HSSC-I (Section B: 42 marks, Section C: 26 marks).',
    totalMarks: 68,
    updatedAt: new Date().toISOString(),
    questions: [
      {
        id: 'phys-b-q2-i',
        questionNumber: 2,
        partLabel: '(i)',
        section: 'B',
        questionType: 'short',
        questionText: 'Show that the equation S = vi t + 1/2 a t^2 is dimensionally consistent.',
        hasOrChoice: true,
        orChoice: {
          questionText: 'Find the dimensions of gravitational constant G and coefficient of viscosity η.',
          maxMarks: 3,
          modelAnswer: 'Dimensions of G: [M^-1 L^3 T^-2], Dimensions of η: [M L^-1 T^-1].',
          mode: 'rubric_levels',
        },
        maxMarks: 3,
        modelAnswer: 'Dimensions of all terms: [S] = [L], [vi t] = [L], [1/2 a t^2] = [L]. LHS = RHS = [L].',
        mode: 'rubric_levels',
        rubricLevels: [
          { id: 'b-q2-i-l1', levelNumber: 1, title: 'Full Marks (3 Marks)', description: 'Complete dimensional analysis showing LHS and RHS are dimensionally homogeneous.', marks: 3 },
          { id: 'b-q2-i-l2', levelNumber: 2, title: 'Partial Marks (2 Marks)', description: 'Substantially correct with minor notation lapse.', marks: 2 },
          { id: 'b-q2-i-l3', levelNumber: 3, title: 'Minimal Marks (1 Mark)', description: 'Basic dimensions of individual terms stated.', marks: 1 },
          { id: 'b-q2-i-l4', levelNumber: 4, title: 'Zero Marks (0 Marks)', description: 'Incorrect, irrelevant, or unattempted response.', marks: 0 },
        ],
      },
      {
        id: 'phys-b-q2-ii',
        questionNumber: 2,
        partLabel: '(ii)',
        section: 'B',
        questionType: 'short',
        questionText: 'At what angle with the horizontal should a projectile be launched to achieve maximum horizontal range?',
        hasOrChoice: true,
        orChoice: {
          questionText: 'Prove that the trajectory of a projectile launched in a uniform gravitational field is parabolic in shape.',
          maxMarks: 3,
          modelAnswer: 'Eliminating time t from horizontal and vertical kinematic equations gives y = ax - bx^2 (parabola).',
          mode: 'rubric_levels',
        },
        maxMarks: 3,
        modelAnswer: 'R = (v_o^2 / g) sin(2θ). Maximum range occurs when sin(2θ) = 1 => 2θ = 90° => θ = 45°.',
        mode: 'rubric_levels',
        rubricLevels: [
          { id: 'b-q2-ii-l1', levelNumber: 1, title: 'Full Marks (3 Marks)', description: 'Complete derivation using range formula and trigonometric maximum.', marks: 3 },
          { id: 'b-q2-ii-l2', levelNumber: 2, title: 'Partial Marks (2 Marks)', description: 'Correct answer 45° with incomplete formula derivation.', marks: 2 },
          { id: 'b-q2-ii-l3', levelNumber: 3, title: 'Minimal Marks (1 Mark)', description: 'Only stated 45° without mathematical justification.', marks: 1 },
          { id: 'b-q2-ii-l4', levelNumber: 4, title: 'Zero Marks (0 Marks)', description: 'Incorrect or unattempted.', marks: 0 },
        ],
      },
      {
        id: 'phys-b-q2-iii',
        questionNumber: 2,
        partLabel: '(iii)',
        section: 'B',
        questionType: 'short',
        questionText: 'A body of mass 0.5 kg attached to a string moves in a circle. Find the tension if speed is 3 m/s and radius 0.5 m.',
        hasOrChoice: true,
        orChoice: {
          questionText: 'A stone of mass 0.1 kg is whirled in a horizontal circle of radius 1.0 m with speed 2.0 m/s. Calculate the tension in the string.',
          maxMarks: 3,
          modelAnswer: 'Centripetal tension formula T = m v^2 / r = 0.1 x (2.0)^2 / 1.0 = 0.1 x 4 / 1 = 0.4 N.',
          mode: 'rubric_levels',
        },
        maxMarks: 3,
        modelAnswer: 'Centripetal force T = m v^2 / r = 0.5 x 3^2 / 0.5 = 9 N.',
        mode: 'rubric_levels',
        rubricLevels: [
          { id: 'b-q2-iii-l1', levelNumber: 1, title: 'Full Marks (3 Marks)', description: 'Correct formula stated, correct numerical substitution, and accurate final value (0.4 N for OR / 9 N for Left).', marks: 3 },
          { id: 'b-q2-iii-l2', levelNumber: 2, title: 'Partial Marks (2 Marks)', description: 'Correct formula and correct calculation with missing unit.', marks: 2 },
          { id: 'b-q2-iii-l3', levelNumber: 3, title: 'Minimal Marks (1 Mark)', description: 'Formula T = m v^2 / r stated correctly but with arithmetic/substitution error (e.g. 0.2 N instead of 0.4 N).', marks: 1 },
          { id: 'b-q2-iii-l4', levelNumber: 4, title: 'Zero Marks (0 Marks)', description: 'Incorrect formula, irrelevant concept, or blank.', marks: 0 },
        ],
      },
      {
        id: 'phys-b-q2-iv',
        questionNumber: 2,
        partLabel: '(iv)',
        section: 'B',
        questionType: 'short',
        questionText: 'Differentiate between elastic and inelastic collisions with suitable examples.',
        hasOrChoice: true,
        orChoice: {
          questionText: 'State the law of conservation of linear momentum and write its mathematical equation for two colliding bodies in an isolated system.',
          maxMarks: 3,
          modelAnswer: 'Total linear momentum remains constant: m1 u1 + m2 u2 = m1 v1 + m2 v2.',
          mode: 'rubric_levels',
        },
        maxMarks: 3,
        modelAnswer: 'Elastic: KE conserved (subatomic collisions). Inelastic: KE not conserved (bullet embedded in block).',
        mode: 'rubric_levels',
        rubricLevels: [
          { id: 'b-q2-iv-l1', levelNumber: 1, title: 'Full Marks (3 Marks)', description: 'Accurate definition, isolated system condition, and mathematical formula.', marks: 3 },
          { id: 'b-q2-iv-l2', levelNumber: 2, title: 'Partial Marks (2 Marks)', description: 'Law stated with minor omission in equation or condition.', marks: 2 },
          { id: 'b-q2-iv-l3', levelNumber: 3, title: 'Minimal Marks (1 Mark)', description: 'Only partial definition without mathematical formula.', marks: 1 },
          { id: 'b-q2-iv-l4', levelNumber: 4, title: 'Zero Marks (0 Marks)', description: 'Incorrect or unattempted.', marks: 0 },
        ],
      },
      {
        id: 'phys-b-q2-v',
        questionNumber: 2,
        partLabel: '(v)',
        section: 'B',
        questionType: 'short',
        questionText: 'Why does a pilot feel weightless when orbiting in a satellite around the Earth?',
        hasOrChoice: true,
        orChoice: {
          questionText: 'Calculate the orbital radius and height of a geostationary satellite above the surface of the Earth.',
          maxMarks: 3,
          modelAnswer: 'Orbital radius r = 4.23 x 10^4 km, height h = r - R = 3.6 x 10^4 km.',
          mode: 'rubric_levels',
        },
        maxMarks: 3,
        modelAnswer: 'Satellite and pilot are both in free fall towards Earth with acceleration g. Apparent weight W_app = m(g - g) = 0.',
        mode: 'rubric_levels',
        rubricLevels: [
          { id: 'b-q2-v-l1', levelNumber: 1, title: 'Full Marks (3 Marks)', description: 'Complete explanation of free fall and zero normal reaction force.', marks: 3 },
          { id: 'b-q2-v-l2', levelNumber: 2, title: 'Partial Marks (2 Marks)', description: 'Mentions free fall and apparent weight without normal force context.', marks: 2 },
          { id: 'b-q2-v-l3', levelNumber: 3, title: 'Minimal Marks (1 Mark)', description: 'Only states gravity is zero or apparent weight formula.', marks: 1 },
          { id: 'b-q2-v-l4', levelNumber: 4, title: 'Zero Marks (0 Marks)', description: 'Incorrect or unattempted.', marks: 0 },
        ],
      },
      {
        id: 'phys-b-q2-vi',
        questionNumber: 2,
        partLabel: '(vi)',
        section: 'B',
        questionType: 'short',
        questionText: 'State Stokes\'s law and write the conditions under which it holds good.',
        hasOrChoice: true,
        orChoice: {
          questionText: 'Define terminal velocity and derive its mathematical formula for a spherical droplet falling in air.',
          maxMarks: 3,
          modelAnswer: 'vt = (2 r^2 ρ g) / (9 η). When drag force equals weight.',
          mode: 'rubric_levels',
        },
        maxMarks: 3,
        modelAnswer: 'Fd = 6πηrv. Holds for spherical, smooth bodies moving with low speed in infinite medium.',
        mode: 'rubric_levels',
        rubricLevels: [
          { id: 'b-q2-vi-l1', levelNumber: 1, title: 'Full Marks (3 Marks)', description: 'Accurate definition of terminal velocity and complete mathematical derivation.', marks: 3 },
          { id: 'b-q2-vi-l2', levelNumber: 2, title: 'Partial Marks (2 Marks)', description: 'Definition and final formula with partial derivation.', marks: 2 },
          { id: 'b-q2-vi-l3', levelNumber: 3, title: 'Minimal Marks (1 Mark)', description: 'Only definition of terminal velocity without derivation.', marks: 1 },
          { id: 'b-q2-vi-l4', levelNumber: 4, title: 'Zero Marks (0 Marks)', description: 'Incorrect or unattempted.', marks: 0 },
        ],
      },
      {
        id: 'phys-b-q2-vii',
        questionNumber: 2,
        partLabel: '(vii)',
        section: 'B',
        questionType: 'short',
        questionText: 'What is the relation between linear and angular momentum? Write its vector form.',
        hasOrChoice: true,
        orChoice: {
          questionText: 'Explain the difference between rotational kinetic energy and translational kinetic energy with formulas.',
          maxMarks: 3,
          modelAnswer: 'K.E_trans = 1/2 m v^2; K.E_rot = 1/2 I ω^2 where I is moment of inertia.',
          mode: 'rubric_levels',
        },
        maxMarks: 3,
        modelAnswer: 'L = r x p = m (r x v). In scalar form: L = mvr = Iω.',
        mode: 'rubric_levels',
        rubricLevels: [
          { id: 'b-q2-vii-l1', levelNumber: 1, title: 'Full Marks (3 Marks)', description: 'Accurate comparative distinction with both governing formulas.', marks: 3 },
          { id: 'b-q2-vii-l2', levelNumber: 2, title: 'Partial Marks (2 Marks)', description: 'Formulas stated with brief physical definition.', marks: 2 },
          { id: 'b-q2-vii-l3', levelNumber: 3, title: 'Minimal Marks (1 Mark)', description: 'Only one formula stated.', marks: 1 },
          { id: 'b-q2-vii-l4', levelNumber: 4, title: 'Zero Marks (0 Marks)', description: 'Incorrect or unattempted.', marks: 0 },
        ],
      },
      {
        id: 'phys-b-q2-viii',
        questionNumber: 2,
        partLabel: '(viii)',
        section: 'B',
        questionType: 'short',
        questionText: 'State the two conditions of equilibrium for a rigid body in vector form.',
        hasOrChoice: true,
        orChoice: {
          questionText: 'Distinguish between center of mass and center of gravity of a body.',
          maxMarks: 3,
          modelAnswer: 'Center of mass is point where applied force produces linear acceleration without rotation; center of gravity is point where total weight acts.',
          mode: 'rubric_levels',
        },
        maxMarks: 3,
        modelAnswer: '1st condition: Σ F = 0 (translational equilibrium). 2nd condition: Σ τ = 0 (rotational equilibrium).',
        mode: 'rubric_levels',
        rubricLevels: [
          { id: 'b-q2-viii-l1', levelNumber: 1, title: 'Full Marks (3 Marks)', description: 'Both conditions stated in vector form with translational and rotational equilibrium specified.', marks: 3 },
          { id: 'b-q2-viii-l2', levelNumber: 2, title: 'Partial Marks (2 Marks)', description: 'Stated both conditions in vector notation without component expansion.', marks: 2 },
          { id: 'b-q2-viii-l3', levelNumber: 3, title: 'Minimal Marks (1 Mark)', description: 'Only one condition stated.', marks: 1 },
          { id: 'b-q2-viii-l4', levelNumber: 4, title: 'Zero Marks (0 Marks)', description: 'Incorrect or unattempted.', marks: 0 },
        ],
      },
      {
        id: 'phys-b-q2-ix',
        questionNumber: 2,
        partLabel: '(ix)',
        section: 'B',
        questionType: 'short',
        questionText: 'Why does sound travel faster in warm air than in cold air?',
        hasOrChoice: true,
        orChoice: {
          questionText: 'Derive Newton\'s formula for the speed of sound in air and explain why Laplace corrected it.',
          maxMarks: 3,
          modelAnswer: 'Newton assumed isothermal: v = √(P/ρ) = 281 m/s. Laplace corrected it as adiabatic: v = √(γ P/ρ) = 332 m/s.',
          mode: 'rubric_levels',
        },
        maxMarks: 3,
        modelAnswer: 'Speed of sound is directly proportional to square root of absolute temperature v ∝ √T.',
        mode: 'rubric_levels',
        rubricLevels: [
          { id: 'b-q2-ix-l1', levelNumber: 1, title: 'Full Marks (3 Marks)', description: 'Newton formula derived, discrepancy identified, and Laplace adiabatic correction explained.', marks: 3 },
          { id: 'b-q2-ix-l2', levelNumber: 2, title: 'Partial Marks (2 Marks)', description: 'Formulas stated with partial explanation of isothermal vs adiabatic assumption.', marks: 2 },
          { id: 'b-q2-ix-l3', levelNumber: 3, title: 'Minimal Marks (1 Mark)', description: 'Only Laplace formula stated without derivation.', marks: 1 },
          { id: 'b-q2-ix-l4', levelNumber: 4, title: 'Zero Marks (0 Marks)', description: 'Incorrect or unattempted.', marks: 0 },
        ],
      },
      {
        id: 'phys-b-q2-x',
        questionNumber: 2,
        partLabel: '(x)',
        section: 'B',
        questionType: 'short',
        questionText: 'What are coherent sources of light? Why can two independent light bulbs not produce interference?',
        hasOrChoice: true,
        orChoice: {
          questionText: 'State the conditions necessary for obtaining clear and sustained constructive and destructive interference of light.',
          maxMarks: 3,
          modelAnswer: 'Coherent sources, monochromatic light, narrow slits, close distance.',
          mode: 'rubric_levels',
        },
        maxMarks: 3,
        modelAnswer: 'Coherent sources maintain constant phase difference. Independent bulbs emit light by spontaneous emission with random phase changes.',
        mode: 'rubric_levels',
        rubricLevels: [
          { id: 'b-q2-x-l1', levelNumber: 1, title: 'Full Marks (3 Marks)', description: 'Clear definition of constant phase difference and explanation of atomic spontaneous emission.', marks: 3 },
          { id: 'b-q2-x-l2', levelNumber: 2, title: 'Partial Marks (2 Marks)', description: 'Correct definition with incomplete explanation of independent bulbs.', marks: 2 },
          { id: 'b-q2-x-l3', levelNumber: 3, title: 'Minimal Marks (1 Mark)', description: 'Basic definition of coherent sources only.', marks: 1 },
          { id: 'b-q2-x-l4', levelNumber: 4, title: 'Zero Marks (0 Marks)', description: 'Incorrect or unattempted.', marks: 0 },
        ],
      },
      {
        id: 'phys-b-q2-xi',
        questionNumber: 2,
        partLabel: '(xi)',
        section: 'B',
        questionType: 'short',
        questionText: 'Explain why diffraction of light is difficult to observe compared to diffraction of sound in daily life.',
        hasOrChoice: true,
        orChoice: {
          questionText: 'State the diffraction grating equation d sin(θ) = m λ and define resolving power of an optical grating.',
          maxMarks: 3,
          modelAnswer: 'd sin(θ) = m λ. Resolving power R = λ / Δλ = N x m.',
          mode: 'rubric_levels',
        },
        maxMarks: 3,
        modelAnswer: 'Diffraction is observable only when obstacle size is comparable to wavelength. Sound wavelength is order of meters; light wavelength is ~10^-7 m.',
        mode: 'rubric_levels',
        rubricLevels: [
          { id: 'b-q2-xi-l1', levelNumber: 1, title: 'Full Marks (3 Marks)', description: 'Thorough comparison between light and sound wavelengths relative to daily obstacles.', marks: 3 },
          { id: 'b-q2-xi-l2', levelNumber: 2, title: 'Partial Marks (2 Marks)', description: 'Mentions wavelength difference without obstacle scale comparison.', marks: 2 },
          { id: 'b-q2-xi-l3', levelNumber: 3, title: 'Minimal Marks (1 Mark)', description: 'Partial qualitative statement.', marks: 1 },
          { id: 'b-q2-xi-l4', levelNumber: 4, title: 'Zero Marks (0 Marks)', description: 'Incorrect, irrelevant, or unattempted.', marks: 0 },
        ],
      },
      {
        id: 'phys-b-q2-xii',
        questionNumber: 2,
        partLabel: '(xii)',
        section: 'B',
        questionType: 'short',
        questionText: 'Describe the optical construction of an astronomical telescope and write the formula for its magnifying power.',
        hasOrChoice: true,
        orChoice: {
          questionText: 'Write the magnifying power formula for a compound microscope and sketch its ray diagram under normal adjustment.',
          maxMarks: 3,
          modelAnswer: 'M = (q/p)(1 + d/fe) ≈ (L/fo)(d/fe).',
          mode: 'rubric_levels',
        },
        maxMarks: 3,
        modelAnswer: 'Objective lens of large focal length fo and eyepiece of small focal length fe. Magnifying power M = fo / fe.',
        mode: 'rubric_levels',
        rubricLevels: [
          { id: 'b-q2-xii-l1', levelNumber: 1, title: 'Full Marks (3 Marks)', description: 'Accurate optical construction and magnifying power formula M = fo / fe.', marks: 3 },
          { id: 'b-q2-xii-l2', levelNumber: 2, title: 'Partial Marks (2 Marks)', description: 'Formula correct with brief construction outline.', marks: 2 },
          { id: 'b-q2-xii-l3', levelNumber: 3, title: 'Minimal Marks (1 Mark)', description: 'Only formula stated.', marks: 1 },
          { id: 'b-q2-xii-l4', levelNumber: 4, title: 'Zero Marks (0 Marks)', description: 'Incorrect or unattempted.', marks: 0 },
        ],
      },
      {
        id: 'phys-b-q2-xiii',
        questionNumber: 2,
        partLabel: '(xiii)',
        section: 'B',
        questionType: 'short',
        questionText: 'What is meant by total internal reflection? State the two necessary conditions for its occurrence.',
        hasOrChoice: true,
        orChoice: {
          questionText: 'Explain the phenomenon of continuous refraction and total internal reflection in optical fibers.',
          maxMarks: 3,
          modelAnswer: 'In graded index fiber, ray bends continuously due to varying index and undergoes total internal reflection.',
          mode: 'rubric_levels',
        },
        maxMarks: 3,
        modelAnswer: 'Light ray in denser medium reflected completely back when angle of incidence exceeds critical angle (i > c). Conditions: 1. Denser to rarer. 2. i > critical angle.',
        mode: 'rubric_levels',
        rubricLevels: [
          { id: 'b-q2-xiii-l1', levelNumber: 1, title: 'Full Marks (3 Marks)', description: 'Complete definition and both necessary physical conditions stated.', marks: 3 },
          { id: 'b-q2-xiii-l2', levelNumber: 2, title: 'Partial Marks (2 Marks)', description: 'Definition and one condition stated.', marks: 2 },
          { id: 'b-q2-xiii-l3', levelNumber: 3, title: 'Minimal Marks (1 Mark)', description: 'Only definition without conditions.', marks: 1 },
          { id: 'b-q2-xiii-l4', levelNumber: 4, title: 'Zero Marks (0 Marks)', description: 'Incorrect or unattempted.', marks: 0 },
        ],
      },
      {
        id: 'phys-b-q2-xiv',
        questionNumber: 2,
        partLabel: '(xiv)',
        section: 'B',
        questionType: 'short',
        questionText: 'Explain the working principle of an optical fiber and why cladding of lower refractive index is used.',
        hasOrChoice: true,
        orChoice: {
          questionText: 'Differentiate between single-mode step index fiber and multi-mode graded index fiber.',
          maxMarks: 3,
          modelAnswer: 'Step index has uniform core index; graded index has parabolic index profile to reduce modal dispersion.',
          mode: 'rubric_levels',
        },
        maxMarks: 3,
        modelAnswer: 'Light is guided by total internal reflection. Cladding has lower index n2 < n1 to ensure total internal reflection at core boundary.',
        mode: 'rubric_levels',
        rubricLevels: [
          { id: 'b-q2-xiv-l1', levelNumber: 1, title: 'Full Marks (3 Marks)', description: 'Total internal reflection mechanism and role of lower index cladding explained.', marks: 3 },
          { id: 'b-q2-xiv-l2', levelNumber: 2, title: 'Partial Marks (2 Marks)', description: 'Mentions total internal reflection with brief cladding mention.', marks: 2 },
          { id: 'b-q2-xiv-l3', levelNumber: 3, title: 'Minimal Marks (1 Mark)', description: 'Basic qualitative sentence.', marks: 1 },
          { id: 'b-q2-xiv-l4', levelNumber: 4, title: 'Zero Marks (0 Marks)', description: 'Incorrect, irrelevant, or unattempted.', marks: 0 },
        ],
      },
      {
        id: 'phys-c-q3',
        questionNumber: 3,
        section: 'C',
        questionType: 'long',
        questionText: 'Define scalar product (dot product). Prove that A · B = B · A and state the condition for perpendicular vectors.',
        hasOrChoice: true,
        orChoice: {
          questionText: 'Explain the addition of two vectors by rectangular components method. Derive expressions for the magnitude and direction of the resultant vector.',
          maxMarks: 7,
          modelAnswer: 'Resultant vector R = Rx i + Ry j where Rx = Ax + Bx, Ry = Ay + By. Magnitude R = √(Rx^2 + Ry^2), Direction θ = tan^-1(Ry / Rx).',
          mode: 'rubric_levels',
        },
        maxMarks: 7,
        modelAnswer: 'A · B = AB cos(θ) = B · A. Perpendicular vectors have A · B = 0.',
        mode: 'rubric_levels',
        rubricLevels: [
          { id: 'c-q3-l1', levelNumber: 1, title: 'Full Marks (7 Marks)', description: 'Comprehensive derivation of rectangular components (or dot product), resultant magnitude, and direction angle.', marks: 7 },
          { id: 'c-q3-l2', levelNumber: 2, title: 'Level 2 (5 Marks)', description: 'Substantially correct derivation with minor algebra step missing.', marks: 5 },
          { id: 'c-q3-l3', levelNumber: 3, title: 'Level 3 (2.5 Marks)', description: 'Partial component addition without magnitude/angle formulas.', marks: 2.5 },
          { id: 'c-q3-l4', levelNumber: 4, title: 'Zero Marks (0 Marks)', description: 'Incorrect, irrelevant, or blank response.', marks: 0 },
        ],
      },
      {
        id: 'phys-c-q4',
        questionNumber: 4,
        section: 'C',
        questionType: 'long',
        questionText: 'State and prove the work-energy theorem for a constant force acting on a body.',
        hasOrChoice: true,
        orChoice: {
          questionText: 'Derive an expression for the gravitational potential energy of a body of mass m at height h above the Earth\'s surface and show conservation of mechanical energy.',
          maxMarks: 6,
          modelAnswer: 'U = mgh. Total energy E = K.E + P.E = constant at all heights.',
          mode: 'rubric_levels',
        },
        maxMarks: 6,
        modelAnswer: 'W = F d = (m a) d. From 2ad = vf^2 - vi^2, d = (vf^2 - vi^2)/(2a) => W = 1/2 m vf^2 - 1/2 m vi^2 = ΔK.E.',
        mode: 'rubric_levels',
        rubricLevels: [
          { id: 'c-q4-l1', levelNumber: 1, title: 'Full Marks (6 Marks)', description: 'Complete derivation proving work done equals change in kinetic energy.', marks: 6 },
          { id: 'c-q4-l2', levelNumber: 2, title: 'Level 2 (4 Marks)', description: 'Substantially correct derivation with minor algebraic lapse.', marks: 4 },
          { id: 'c-q4-l3', levelNumber: 3, title: 'Level 3 (2 Marks)', description: 'Partial derivation starting from W = F d.', marks: 2 },
          { id: 'c-q4-l4', levelNumber: 4, title: 'Zero Marks (0 Marks)', description: 'Incorrect or unattempted.', marks: 0 },
        ],
      },
      {
        id: 'phys-c-q5',
        questionNumber: 5,
        section: 'C',
        questionType: 'long',
        questionText: 'Describe the four operations of a Carnot cycle and derive the expression for the efficiency of a Carnot heat engine.',
        hasOrChoice: true,
        orChoice: {
          questionText: 'Show that the motion of a mass attached to a spring executing horizontal oscillations is Simple Harmonic Motion (SHM). Derive formulas for its time period and instantaneous velocity.',
          maxMarks: 7,
          modelAnswer: 'F = -kx => a = -(k/m)x = -ω^2 x. Since a ∝ -x, motion is SHM. Time period T = 2π√(m/k), velocity v = ω√(xo^2 - x^2).',
          mode: 'rubric_levels',
        },
        maxMarks: 7,
        modelAnswer: 'Carnot four stages: isothermal expansion, adiabatic expansion, isothermal compression, adiabatic compression. Efficiency η = 1 - T2 / T1.',
        mode: 'rubric_levels',
        rubricLevels: [
          { id: 'c-q5-l1', levelNumber: 1, title: 'Full Marks (7 Marks)', description: 'Complete proof of SHM (or Carnot cycle) with time period and velocity derivations.', marks: 7 },
          { id: 'c-q5-l2', levelNumber: 2, title: 'Level 2 (5 Marks)', description: 'Substantially correct derivation with minor intermediate omission.', marks: 5 },
          { id: 'c-q5-l3', levelNumber: 3, title: 'Level 3 (2.5 Marks)', description: 'Governing equations and partial proof.', marks: 2.5 },
          { id: 'c-q5-l4', levelNumber: 4, title: 'Zero Marks (0 Marks)', description: 'Incorrect, irrelevant, or blank.', marks: 0 },
        ],
      },
      {
        id: 'phys-c-q6',
        questionNumber: 6,
        section: 'C',
        questionType: 'long',
        questionText: 'State Brewster\'s law of polarisation. Show that the reflected and refracted rays are at right angles when light is incident at polarizing angle.',
        hasOrChoice: true,
        orChoice: {
          questionText: 'Prove that the difference between molar specific heat at constant pressure and molar specific heat at constant volume of an ideal gas is equal to universal gas constant (Cp - Cv = R).',
          maxMarks: 6,
          modelAnswer: 'From 1st law dQ = dU + dW. At const volume dQv = n Cv dT = dU. At const pressure dQp = n Cp dT = dU + P dV = n Cv dT + n R dT => Cp - Cv = R.',
          mode: 'rubric_levels',
        },
        maxMarks: 6,
        modelAnswer: 'Brewster\'s law: μ = tan(ip). Since r + ip = 90°, reflected and refracted rays are mutually perpendicular.',
        mode: 'rubric_levels',
        rubricLevels: [
          { id: 'c-q6-l1', levelNumber: 1, title: 'Full Marks (6 Marks)', description: 'Complete thermodynamic proof of Cp - Cv = R (or Brewster\'s law).', marks: 6 },
          { id: 'c-q6-l2', levelNumber: 2, title: 'Level 2 (4 Marks)', description: 'Substantially correct proof with minor explanation omission.', marks: 4 },
          { id: 'c-q6-l3', levelNumber: 3, title: 'Level 3 (2 Marks)', description: 'Stated First Law and partial working.', marks: 2 },
          { id: 'c-q6-l4', levelNumber: 4, title: 'Zero Marks (0 Marks)', description: 'Incorrect or unattempted.', marks: 0 },
        ],
      },
    ],
  },
];

// Helper calculations
export const calculateQuestionKeyPointsTotal = (
  keyPoints?: MarkingKeyPoint[]
): number => {
  if (!keyPoints || !Array.isArray(keyPoints)) return 0;
  return Number(keyPoints.reduce((acc, curr) => acc + (Number(curr.marks) || 0), 0).toFixed(2));
};

export const calculateQuestionRubricHighestLevel = (
  rubricLevels?: MarkingRubricLevel[]
): number => {
  if (!rubricLevels || !Array.isArray(rubricLevels) || rubricLevels.length === 0) return 0;
  // Highest mark among levels
  const marks = rubricLevels.map((l) => Number(l.marks) || 0);
  return Math.max(...marks);
};

export const isQuestionMarksValid = (
  question: MarkingQuestionScheme
): { valid: boolean; reason?: string } => {
  const maxMarks = Number(question.maxMarks) || 0;

  if (question.hasSubParts && question.subParts && question.subParts.length > 0) {
    const subPartsTotal = question.subParts.reduce((sum, sp) => sum + (Number(sp.maxMarks) || 0), 0);
    if (Math.abs(subPartsTotal - maxMarks) > 0.01) {
      return {
        valid: false,
        reason: `Sum of sub-parts (${subPartsTotal}) does not match question max marks (${maxMarks}).`,
      };
    }
    // Check each sub-part
    for (const sp of question.subParts) {
      if (sp.mode === 'rubric_levels') {
        const highest = calculateQuestionRubricHighestLevel(sp.rubricLevels);
        if (Math.abs(highest - Number(sp.maxMarks)) > 0.01) {
          return {
            valid: false,
            reason: `Sub-part ${sp.partLabel} Level 1 marks (${highest}) must equal sub-part max marks (${sp.maxMarks}).`,
          };
        }
      } else {
        const total = calculateQuestionKeyPointsTotal(sp.keyPoints);
        if (Math.abs(total - Number(sp.maxMarks)) > 0.01) {
          return {
            valid: false,
            reason: `Sub-part ${sp.partLabel} key points sum (${total}) must equal sub-part max marks (${sp.maxMarks}).`,
          };
        }
      }
    }
    return { valid: true };
  }

  if (question.mode === 'rubric_levels') {
    const highest = calculateQuestionRubricHighestLevel(question.rubricLevels);
    if (Math.abs(highest - maxMarks) > 0.01) {
      return {
        valid: false,
        reason: `Level 1 (highest level) marks (${highest}) must equal question max marks (${maxMarks}).`,
      };
    }
    return { valid: true };
  }

  // Key points mode
  const total = calculateQuestionKeyPointsTotal(question.keyPoints);
  if (Math.abs(total - maxMarks) > 0.01) {
    return {
      valid: false,
      reason: `Key points sum (${total}) must equal question max marks (${maxMarks}).`,
    };
  }

  return { valid: true };
};
