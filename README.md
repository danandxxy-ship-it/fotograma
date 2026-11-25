# Fotograma

Jogo multiplayer no navegador, com menu principal, menu de pausa e sons: aparece um frame real de um filme, série, anime ou desenho e quem acertar o nome primeiro leva mais pontos. Até 16 pessoas por sala, celular, PC ou TV com controle.

## Como funciona uma rodada
1. Cada rodada tem um **projecionista** (revezando entre os jogadores). Ele vê a película com 8 frames cobertos e escolhe um.
2. O frame aparece para todo mundo. Todos chutam o nome, inclusive o projecionista.
3. Com o tempo passando, a dica do título aparece (tracinhos, depois algumas letras) e mais frames são revelados. O projecionista também pode revelar um frame extra.
4. Quem não faz ideia aperta **Não sei**. Se todo mundo que ainda não acertou apertar, a rodada acaba na hora.
5. No fim do tempo (ou quando todos acertam ou passam) a resposta aparece com o pôster e a película inteira.

**Pontos:** 100 a 300 pelo acerto (quanto mais rápido, mais). Bônus de colocação: 1º +120, 2º +70, 3º +35. Título exato e completo: +80. O projecionista ganha +20 por cada pessoa que acerta. Frames extras revelados diminuem o valor do acerto. Ninguém vê o nome antes do fim da rodada: quando alguém acerta, os outros só veem "acertou", e chutes parecidos com a resposta aparecem escondidos.

**Sons:** gerados no próprio navegador (sem arquivos de áudio). Volume, som e vibração ficam em Ajustes.

**Correção inteligente:** aceita sem acento, com erro de digitação, sem artigo, só parte do título ("Bob Esponja", "Aranhaverso"), título em inglês ou original (ex.: "Shingeki no Kyojin"), números romanos ou por extenso. Mas "Toy Story 2" não vale para "Toy Story 3". Quando está perto, avisa "Quase!".

## 1. Pegue a chave do TMDB (grátis)
Os frames vêm do TMDB (themoviedb.org). Crie uma conta, vá em **Configurações › API**, peça a chave (uso pessoal) e copie o **Token de leitura da API**.
Você pode colocar no servidor (`TMDB_TOKEN`) ou colar no lobby na hora de jogar.

## 2a. Jogar na mesma Wi-Fi (PC ou Termux no Android)
```bash
npm install
TMDB_TOKEN=seu_token npm start
```
O terminal mostra o endereço tipo `http://192.168.0.10:3000`. Todo mundo na mesma Wi-Fi abre esse link no celular.

No Android com Termux: `pkg install nodejs`, copie a pasta e rode os mesmos comandos.

## 2b. Jogar pela internet (amigos em qualquer lugar)
Render.com (grátis): suba esta pasta num repositório do GitHub, em Render clique **New › Blueprint**, escolha o repositório (ele lê o `render.yaml`) e cole o `TMDB_TOKEN`. O link `https://...onrender.com` serve pra todo mundo. O plano grátis "dorme" sem uso; o primeiro acesso demora uns 30 s.

## Controle (gamepad)
Direcional/analógico move a seleção, **A** confirma, **B** volta ou vai pro campo de palpite, **X** é "Não sei", **Y** mostra quem está na sala, **Start** inicia a partida ou abre o menu.

## Modo demonstração
`npm run demo` roda sem TMDB, com imagens abstratas — só para testar o fluxo.

## Testes
`npm test` roda 46 casos da correção de respostas.

---
Este produto usa a API do TMDB, mas não é endossado nem certificado pelo TMDB.


## Modo música

- Marque **Músicas** no lobby (sozinho ou misturado com filmes, séries etc.) e escolha o estilo: Misturado, Brasil, Rock, Pop, Rap, Eletrônica ou Anos 80 e 90.
- Fonte: iTunes Search API da Apple (sem chave), prévia oficial de 30 s. Toca um trecho de 4 s por vez; o projecionista solta até 3 trechos e a prévia inteira toca na revelação.
- Vale o nome da música ou o da banda/cantor. Acertar só o artista rende 60% dos pontos.
- Sala só de músicas não precisa do token do TMDB.
- Se a busca de música falhar, a rodada cai para filme/série.

## Palpite por voz

- Botão de microfone dentro do campo de palpite (aparece só em navegador com reconhecimento de voz, como o Chrome do Android). No controle: LB ou RB.
- Fala em pt-BR; o palpite vai sozinho quando você para de falar. O navegador manda até 5 versões do que ouviu e o servidor fica com a que mais se aproxima da resposta.
- Precisa de HTTPS (o Render já tem) e da permissão de microfone.

## Modo Arcade e bots

- No lobby: **Modo de jogo → Arcade com poderes**. Cada jogador recebe 2 lâminas no começo, +1 por rodada (máx. 3) e +1 se acertar em 1º.
- Ataques (em quem ainda não acertou): Borrão, Tela virada, Tinta na lente, Apagão (modo filme); Fone mudo, Esquilo (modo música); Congelar (7 s sem chutar, validado no servidor), Teclado doido (troca letras e desliga o microfone), Pedágio (30% do próximo acerto vai para quem jogou).
- Truques (para si): Espiada (um frame a mais só seu), Lupa (iniciais + ano), Espelho (devolve o próximo ataque; dois espelhos se anulam), Dobro (próximo acerto x2), Radar (chute errado diz quente/morno/frio).
- 3,5 s de recarga entre lâminas. No controle: RT foca as lâminas, A usa, B cancela.
- **Bots**: o anfitrião põe até 7 (Bobo, Esperto, Craque). Eles escolhem frames, soltam pistas, chutam com erros de digitação, erram, passam a vez e usam poderes (preferem atacar quem lidera). Quando só faltam bots, eles resolvem em poucos segundos.
- Teste: `FG_DECK=borrao,congela,...` fixa a ordem das lâminas (só para testes).

## Modos especiais (escolha um por partida)

- **Games**: capturas de tela da Steam (`store.steampowered.com/api/appdetails`, sem chave). Lista curada de ~100 jogos por dificuldade, com apelidos (GTA 5, CS2, RDR2…). Jogos com conteúdo adulto são pulados.
- **Personagens**: vale o nome do personagem. Filmes e séries vêm do TMDB (fotos do ator + cenas da obra; precisa do token); animes vêm do MyAnimeList via Jikan (imagem do próprio personagem, sem chave). Chutar o nome do ator mostra "Esse é o ator!" e não conta. Nome completo ganha o bônus de exato.
- **Verdadeiro ou falso**: banco de ~70 afirmações conferidas + afirmações geradas do TMDB (ano, duração, temporadas, diretor) quando há token. Até 20 s por cartela, ninguém vê a resposta dos outros até o fim, acerto mais rápido vale mais. Teclado: V/F. Controle: LB/RB.
- **Reações**: 8 emojis embaixo da tela; sobem na tela de todos com o nome de quem mandou. Bots também reagem.

## Modo transmissão (TV)
Uma tela grande mostra o jogo, e cada pessoa joga pelo celular.
- Na TV (navegador da smart TV, computador ligado na TV, Chromecast com navegador…), abra **/tv**.
- **Abrir uma sala nesta TV**: a TV cria a sala e mostra um QR code e o código. Quem entrar primeiro pelo celular vira o anfitrião e escolhe o modo.
- **Já tem sala aberta?**: digite o código de 4 letras e a TV se liga numa sala que já existe. No lobby do celular, o botão **Mostrar na TV** explica o passo a passo.
- A TV não conta como jogador. Ela mostra o frame grande, o placar, quem acertou, os poderes do arcade e as reações.
- No modo Músicas o som sai na TV e os celulares ficam quietos. Tocar num trecho no celular toca ali também.
- O QR code é gerado em `/qr/CODIGO.svg` e leva direto para `/?sala=CODIGO`.

## Diagnóstico
`/diag` mostra se o servidor alcança TMDB, iTunes, Deezer, Steam, Jikan e AniList. Personagens de anime usam o Jikan (MyAnimeList) e, se ele não responder, o AniList.

## Quem sai da sala
- Fechou a aba, o app ou caiu a internet: fica "sem conexão" por 12 s no lobby (25 s no jogo) e depois sai da sala.
- O botão "Sair" tira da sala na hora.
- Se voltar na mesma partida, recupera os pontos.

## Créditos finais com zoeira
No fim, quem ganhou leva o **Fotograma de Ouro** com um elogio, quem ficou por último leva a **Pipoca Murcha** com uma zoeira, e saem até 4 prêmios engraçados (Dedo mais rápido, Mira de sniper, Chutador profissional, Rei do quase, Não sei, não vi, Fã do elenco, Encrenqueiro, Saco de pancada). As frases saem do que cada um fez na partida (`roast.js`), e todo mundo vê as mesmas, inclusive a TV.
