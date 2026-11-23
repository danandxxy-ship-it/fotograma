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
