export type LocalPose = {
  id: string;
  category: string;
  label: string;
  preview: string;
};

export const POSES: LocalPose[] = [
  // EM PÉ
  { id: "NSFW_standing023_depth", category: "standing", label: "Em Pé", preview: "https://central.daev.ca/wp-content/uploads/2026/02/NSFW_standing023_depth.webp" },
  { id: "NSFW_standing025_depth", category: "standing", label: "Em Pé", preview: "https://central.daev.ca/wp-content/uploads/2026/02/NSFW_standing025_depth.webp" },
  { id: "NSFW_standing026_depth", category: "standing", label: "Em Pé", preview: "https://central.daev.ca/wp-content/uploads/2026/02/NSFW_standing026_depth.webp" },
  { id: "NSFW_standing027_depth", category: "standing", label: "Em Pé", preview: "https://central.daev.ca/wp-content/uploads/2026/02/NSFW_standing027_depth.webp" },
  { id: "NSFW_standing028_depth", category: "standing", label: "Em Pé", preview: "https://central.daev.ca/wp-content/uploads/2026/02/NSFW_standing028_depth.webp" },
  { id: "NSFW_standing030_depth", category: "standing", label: "Em Pé", preview: "https://central.daev.ca/wp-content/uploads/2026/02/NSFW_standing030_depth.webp" },
  { id: "NSFW_standing031_depth", category: "standing", label: "Em Pé", preview: "https://central.daev.ca/wp-content/uploads/2026/02/NSFW_standing031_depth.webp" },
  { id: "NSFW_standing032_depth", category: "standing", label: "Em Pé", preview: "https://central.daev.ca/wp-content/uploads/2026/02/NSFW_standing032_depth.webp" },
  { id: "NSFW_standing040_depth", category: "standing", label: "Em Pé", preview: "https://central.daev.ca/wp-content/uploads/2026/02/NSFW_standing040_depth.webp" },
  { id: "NSFW_standing050_depth", category: "standing", label: "Em Pé", preview: "https://central.daev.ca/wp-content/uploads/2026/02/NSFW_standing050_depth.webp" },
  { id: "NSFW_standing060_depth", category: "standing", label: "Em Pé", preview: "https://central.daev.ca/wp-content/uploads/2026/02/NSFW_standing060_depth.webp" },
  { id: "NSFW_standing070_depth", category: "standing", label: "Em Pé", preview: "https://central.daev.ca/wp-content/uploads/2026/02/NSFW_standing070_depth.webp" },
  { id: "NSFW_standing080_depth", category: "standing", label: "Em Pé", preview: "https://central.daev.ca/wp-content/uploads/2026/02/NSFW_standing080_depth.webp" },
  { id: "NSFW_standing090_depth", category: "standing", label: "Em Pé", preview: "https://central.daev.ca/wp-content/uploads/2026/02/NSFW_standing090_depth.webp" },
  { id: "NSFW_standing100_depth", category: "standing", label: "Em Pé", preview: "https://central.daev.ca/wp-content/uploads/2026/02/NSFW_standing100_depth.webp" },
  // DEITADO
  { id: "NSFW_lying001_depth", category: "lying", label: "Deitado", preview: "https://central.daev.ca/wp-content/uploads/2026/02/NSFW_lying001_depth.webp" },
  { id: "NSFW_lying002_depth", category: "lying", label: "Deitado", preview: "https://central.daev.ca/wp-content/uploads/2026/02/NSFW_lying002_depth.webp" },
  { id: "NSFW_lying003_depth", category: "lying", label: "Deitado", preview: "https://central.daev.ca/wp-content/uploads/2026/02/NSFW_lying003_depth.webp" },
  { id: "NSFW_lying005_depth", category: "lying", label: "Deitado", preview: "https://central.daev.ca/wp-content/uploads/2026/02/NSFW_lying005_depth.webp" },
  { id: "NSFW_lying010_depth", category: "lying", label: "Deitado", preview: "https://central.daev.ca/wp-content/uploads/2026/02/NSFW_lying010_depth.webp" },
  { id: "NSFW_lying015_depth", category: "lying", label: "Deitado", preview: "https://central.daev.ca/wp-content/uploads/2026/02/NSFW_lying015_depth.webp" },
  // AJOELHADO
  { id: "NSFW_kneeling001_depth", category: "kneeling", label: "Ajoelhado", preview: "https://central.daev.ca/wp-content/uploads/2026/02/NSFW_kneeling001_depth.webp" },
  { id: "NSFW_kneeling002_depth", category: "kneeling", label: "Ajoelhado", preview: "https://central.daev.ca/wp-content/uploads/2026/02/NSFW_kneeling002_depth.webp" },
  { id: "NSFW_kneeling005_depth", category: "kneeling", label: "Ajoelhado", preview: "https://central.daev.ca/wp-content/uploads/2026/02/NSFW_kneeling005_depth.webp" },
  { id: "NSFW_kneeling010_depth", category: "kneeling", label: "Ajoelhado", preview: "https://central.daev.ca/wp-content/uploads/2026/02/NSFW_kneeling010_depth.webp" },
  // SENTADO
  { id: "NSFW_sitting001_depth", category: "sitting", label: "Sentado", preview: "https://central.daev.ca/wp-content/uploads/2026/02/NSFW_sitting001_depth.webp" },
  { id: "NSFW_sitting002_depth", category: "sitting", label: "Sentado", preview: "https://central.daev.ca/wp-content/uploads/2026/02/NSFW_sitting002_depth.webp" },
  { id: "NSFW_sitting005_depth", category: "sitting", label: "Sentado", preview: "https://central.daev.ca/wp-content/uploads/2026/02/NSFW_sitting005_depth.webp" },
  { id: "NSFW_sitting010_depth", category: "sitting", label: "Sentado", preview: "https://central.daev.ca/wp-content/uploads/2026/02/NSFW_sitting010_depth.webp" },
  // DE QUATRO
  { id: "NSFW_allfours001_depth", category: "all_fours", label: "De Quatro", preview: "https://central.daev.ca/wp-content/uploads/2026/02/NSFW_allfours001_depth.webp" },
  { id: "NSFW_allfours002_depth", category: "all_fours", label: "De Quatro", preview: "https://central.daev.ca/wp-content/uploads/2026/02/NSFW_allfours002_depth.webp" },
  { id: "NSFW_allfours003_depth", category: "all_fours", label: "De Quatro", preview: "https://central.daev.ca/wp-content/uploads/2026/02/NSFW_allfours003_depth.webp" },
  // AGACHADO
  { id: "NSFW_squatting001_depth", category: "squatting", label: "Agachado", preview: "https://central.daev.ca/wp-content/uploads/2026/02/NSFW_squatting001_depth.webp" },
  { id: "NSFW_squatting005_depth", category: "squatting", label: "Agachado", preview: "https://central.daev.ca/wp-content/uploads/2026/02/NSFW_squatting005_depth.webp" },
  // SUSPENSO
  { id: "NSFW_suspended001_depth", category: "suspended", label: "Suspenso", preview: "https://central.daev.ca/wp-content/uploads/2026/02/NSFW_suspended001_depth.webp" },
  { id: "NSFW_suspended005_depth", category: "suspended", label: "Suspenso", preview: "https://central.daev.ca/wp-content/uploads/2026/02/NSFW_suspended005_depth.webp" },
  // CASAL
  { id: "NSFW_couple001_depth", category: "couple", label: "Casal", preview: "https://central.daev.ca/wp-content/uploads/2026/02/NSFW_couple001_depth.webp" },
  { id: "NSFW_couple005_depth", category: "couple", label: "Casal", preview: "https://central.daev.ca/wp-content/uploads/2026/02/NSFW_couple005_depth.webp" },
];

export const POSE_CATEGORIES = [
  { id: "standing", label: "Em Pé" },
  { id: "lying", label: "Deitado" },
  { id: "kneeling", label: "Ajoelhado" },
  { id: "sitting", label: "Sentado" },
  { id: "all_fours", label: "De Quatro" },
  { id: "squatting", label: "Agachado" },
  { id: "suspended", label: "Suspenso" },
  { id: "couple", label: "Casal" },
];