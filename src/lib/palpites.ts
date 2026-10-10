// O palpite de categoria mora em categorias.ts, junto da lista de categorias,
// porque o bot do Telegram (api/_lib) também lê o mesmo arquivo. Este aqui
// continua existindo para quem já importava de "@/lib/palpites".
export { sugerirCategoria } from "./categorias";
