---
titre: Veille FDE
resume: Un outil de veille sur l'IA générative en entreprise, tenu par des agents, qui prépare posts, fiches hebdo et dossiers.
ordre: 1
lien: https://veille.mathieucasteras.fr
---

## Ce qu'il fait

Chaque jour, l'outil relève mes sources (flux RSS, pages d'éditeurs, arXiv, dépôts GitHub), retient ce qui compte pour l'IA
générative **en entreprise**, le résume, et me le présente dans un flux que je parcours, annote et classe. Le vendredi, il rédige
une fiche de la semaine : ce qui est prêt pour la production, ce qui est expérimental, ce que je veux tester. Quand un sujet
mérite plus, je lance un *focus* : l'outil analyse le sujet en profondeur, vérifie les benchmarks annoncés, compare les alternatives,
et me rend un dossier avec ses sources. De là partent les posts que je publie.

Ce site montre la partie que je choisis de rendre publique : rien n'y arrive sans que je l'aie marqué à la main.

## Comment il est construit

- **Des agents, pas des scripts.** Chaque tâche (collecte, traitement, fiche, focus) est un agent : un modèle de langage
  reçoit une consigne, dispose d'outils (consulter une page, chercher, interroger arXiv ou GitHub, consulter et mettre à jour la base) et
  décide de ses appels. Les consignes sont des textes versionnés avec le code.
- **Une couche LLM agnostique.** Aucun nom de modèle dans le code : un fichier de configuration relie trois niveaux
  (rapide, standard, avancé) à des modèles concrets par fournisseur, avec un fournisseur actif et un secours. Chaque document
  produit garde le nom du modèle qui l'a écrit, ce qui permet de comparer. Le coût de chaque appel est journalisé.
- **Des garde-fous.** Les agents ne touchent jamais à mes choix : statuts, notes, étiquettes, ce que j'ai classé. Ils proposent
  des ajustements de mon profil de veille, je les valide ou non. Aucun chiffre n'est inventé : les résumés, fiches et dossiers
  citent leurs sources, et une case vide vaut mieux qu'une valeur douteuse.
- **Une base simple.** SQLite, un fichier, des documents JSON versionnés (toute écriture vérifie la version qu'elle croit
  modifier). Recherche plein texte intégrée. Copie chaque nuit, sauvegarde Git chaque semaine.
- **Deux processus.** Une API (FastAPI) qui sert aussi l'interface, et un *worker* qui tient le planificateur et la file de
  travaux. Le tout dans Docker sur une petite machine virtuelle, derrière un seul serveur web.
- **Une vitrine en lecture seule.** L'API expose, sans compte, ce que j'ai marqué public : c'est ce que ce site reprend à chaque
  reconstruction. Il ne peut rien écrire.
