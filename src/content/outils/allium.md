---
titre: Allium
resume: Un copilote de planification des repas pour quelques foyers proches, sur invitation, en construction.
ordre: 2
lien: https://allium.mathieucasteras.fr
---

## Ce qu'il fait

Allium aide un foyer à décider ce qu'il mange dans la semaine : composer le plan des repas à partir de ses propres recettes,
tenir compte de qui est à table et de ce qu'il reste, puis en tirer la liste des courses. L'outil est privé : chaque foyer
y entre sur invitation, ne voit que ses données, et les règle à sa main (convives, habitudes, contraintes). Il est en
construction : les fondations (comptes, foyers, réglages, administration) sont en place, les écrans de planification et de
courses arrivent lot par lot.

## Comment il est construit

- **Un foyer, un espace.** Les données d'un foyer ne sont jamais visibles d'un autre ; aucune route ne permet de choisir son
  foyer, le serveur le déduit du compte connecté. Les invitations sont des liens à usage unique, qui expirent.
- **Sobre et hors ligne par défaut.** L'interface est faite pour le téléphone, en français, en thème clair et sombre ;
  elle ne charge ni police, ni script, ni traqueur depuis un tiers. Les réglages se retrouvent d'un appareil à l'autre.
- **Une pile simple.** Une API (FastAPI) qui sert aussi l'interface (React), une base PostgreSQL, le tout dans Docker sur la
  même petite machine que ce site, derrière un seul serveur web. Le conteneur de l'application tourne sans privilège, en
  lecture seule.
- **Des données protégées.** Une copie de la base chaque nuit, une restauration testée avant d'ouvrir l'outil à d'autres
  foyers.
