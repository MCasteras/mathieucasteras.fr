/** Libellés des thèmes de la veille (codes `T1`…`T11`, `veille-fde/docs/00-etat-v1.md`). Un code inconnu s'affiche tel quel. */
export const THEMES: Record<string, string> = {
  T1: 'Inférence et serving',
  T2: 'Compression',
  T3: 'Usage et FinOps',
  T4: 'Prompting et contexte',
  T5: 'RAG et code',
  T6: 'Agents',
  T7: 'Évaluation et observabilité',
  T8: 'Sécurité et conformité',
  T9: 'Traitement documentaire',
  T10: 'Adoption et conduite du changement',
  T11: 'Développement assisté par agents',
};

export function libelleTheme(code: string): string {
  return THEMES[code] ?? code;
}
