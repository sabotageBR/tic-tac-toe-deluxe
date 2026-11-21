# Calibragem por bot (2026-11-17)

CPU contra CPU (`node tools/calibrar.mjs`), quem começa alterna a cada partida, como no jogo. "Começa" = vitórias de quem
começou. O nível padrão da CPU é o 2 (20% de lance sorteado, busca de 4 lances); o 4 joga perfeito no 3×3.

| Submodo | Orçamento (nós) | Nível 2 × 2: começa / segundo / empate | Lances por partida | Lance da CPU (Node) |
|---|---|---|---|---|
| Clássico 3×3 | 30 000 | 14 / 3 / 23 (40 partidas) | 7,9 | 0,2 ms (máx. 3) |
| Grande 5×5, 4 em linha | 10 000 | 18 / 10 / 12 (40 partidas) | 14,3 | 6,3 ms (máx. 20) |
| Grande 5×5, 4 em linha | 30 000 | 21 / 5 / 14 (40 partidas) | 15,1 | 14 ms (máx. 49) |
| Grande 5×5, nível 4 × 4 | 10 000 | 5 / 0 / 5 (10 partidas) | 17,0 | 9,8 ms (máx. 19) |

Por que o Grande busca 10 000 nós e não os 30 000 do Clássico: o lance da CPU roda inteiro num quadro (a busca é
síncrona). Com 30 000 o pior lance passou de 50 ms no Node, o que no celular vira um tranco visível; com 10 000 fica em
20 ms, e o jogo até fica mais equilibrado para quem joga em segundo (10 vitórias contra 5).

Por que 5×5 com 4 em linha: é o tabuleiro maior em que a partida ainda cabe em ~15 lances. O 4×4 com 4 em linha empata
quase sempre (35 de 40 no nível 2 × 2), e o 4×4 com 3 em linha é vitória fácil de quem começa.
