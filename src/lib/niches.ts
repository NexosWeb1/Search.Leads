/**
 * Nichos em portugues mapeados para os place types da Table A da Places API.
 *
 * Todo type aqui foi conferido contra a Table A oficial. Isso importa porque um
 * type inexistente faz a API devolver HTTP 400 e derruba a varredura inteira,
 * nao apenas aquele nicho. Ao adicionar nicho novo, confira o identificador em
 * developers.google.com/maps/documentation/places/web-service/place-types
 *
 * Observacao: nao existe mais o type `accounting` na Table A, por isso
 * Contabilidade aponta para `consultant`, que e onde esses negocios caem hoje.
 */

export interface Nicho {
  id: string;
  label: string;
  grupo: string;
  types: string[];
}

/**
 * Busca geral. A Places API aceita no maximo 50 types por requisicao, e esta
 * lista tem exatamente 50: os ramos que mais precisam de site e menos costumam
 * ter. Ficaram de fora de proposito coisas como posto de gasolina,
 * estacionamento e rede de farmacia, que raramente viram cliente de agencia.
 */
export const TYPES_BUSCA_GERAL = [
  'beauty_salon', 'barber_shop', 'hair_salon', 'nail_salon', 'spa', 'skin_care_clinic',
  'dentist', 'dental_clinic', 'medical_clinic', 'doctor', 'physiotherapist', 'veterinary_care',
  'restaurant', 'pizza_restaurant', 'bakery', 'cake_shop', 'cafe', 'bar', 'acai_shop', 'ice_cream_shop',
  'clothing_store', 'womens_clothing_store', 'shoe_store', 'jewelry_store', 'cosmetics_store',
  'furniture_store', 'home_goods_store', 'pet_store', 'sporting_goods_store', 'gift_shop', 'florist',
  'bicycle_store', 'cell_phone_store', 'auto_parts_store', 'book_store', 'toy_store',
  'car_repair', 'car_wash', 'tire_shop', 'laundry', 'tailor', 'locksmith',
  'gym', 'fitness_center', 'sports_club', 'yoga_studio',
  'lawyer', 'real_estate_agency', 'insurance_agency', 'travel_agency',
];

export const NICHOS: Nicho[] = [
  { id: 'geral', label: 'Busca geral', grupo: 'Geral', types: TYPES_BUSCA_GERAL },

  // Saude
  { id: 'clinica-medica', label: 'Clinica medica', grupo: 'Saude', types: ['medical_clinic', 'doctor', 'medical_center'] },
  { id: 'odontologia', label: 'Odontologia', grupo: 'Saude', types: ['dentist', 'dental_clinic'] },
  { id: 'fisioterapia', label: 'Fisioterapia', grupo: 'Saude', types: ['physiotherapist', 'chiropractor'] },
  { id: 'laboratorio', label: 'Laboratorio de analises', grupo: 'Saude', types: ['medical_lab'] },
  { id: 'veterinaria', label: 'Veterinaria', grupo: 'Saude', types: ['veterinary_care'] },
  { id: 'farmacia', label: 'Farmacia', grupo: 'Saude', types: ['pharmacy', 'drugstore'] },

  // Beleza e estetica
  { id: 'barbearia', label: 'Barbearia', grupo: 'Beleza e estetica', types: ['barber_shop'] },
  { id: 'salao-beleza', label: 'Salao de beleza', grupo: 'Beleza e estetica', types: ['beauty_salon', 'hair_salon', 'hair_care'] },
  { id: 'manicure', label: 'Manicure e nail design', grupo: 'Beleza e estetica', types: ['nail_salon'] },
  { id: 'estetica', label: 'Clinica de estetica', grupo: 'Beleza e estetica', types: ['skin_care_clinic', 'spa', 'massage_spa', 'wellness_center'] },
  { id: 'tatuagem', label: 'Tatuagem e piercing', grupo: 'Beleza e estetica', types: ['body_art_service'] },
  { id: 'maquiagem', label: 'Maquiagem', grupo: 'Beleza e estetica', types: ['makeup_artist', 'beautician'] },

  // Alimentacao
  { id: 'restaurante', label: 'Restaurante', grupo: 'Alimentacao', types: ['restaurant', 'brazilian_restaurant', 'family_restaurant'] },
  { id: 'pizzaria', label: 'Pizzaria', grupo: 'Alimentacao', types: ['pizza_restaurant', 'pizza_delivery'] },
  { id: 'lanchonete', label: 'Lanchonete e hamburgueria', grupo: 'Alimentacao', types: ['hamburger_restaurant', 'fast_food_restaurant', 'snack_bar', 'sandwich_shop'] },
  { id: 'padaria', label: 'Padaria e confeitaria', grupo: 'Alimentacao', types: ['bakery', 'cake_shop', 'pastry_shop', 'confectionery'] },
  { id: 'cafeteria', label: 'Cafeteria', grupo: 'Alimentacao', types: ['cafe', 'coffee_shop'] },
  { id: 'acai-sorveteria', label: 'Acai e sorveteria', grupo: 'Alimentacao', types: ['acai_shop', 'ice_cream_shop', 'juice_shop'] },
  { id: 'bar', label: 'Bar e pub', grupo: 'Alimentacao', types: ['bar', 'pub', 'bar_and_grill', 'sports_bar'] },
  { id: 'churrascaria', label: 'Churrascaria', grupo: 'Alimentacao', types: ['barbecue_restaurant', 'steak_house'] },
  { id: 'japonesa', label: 'Comida japonesa', grupo: 'Alimentacao', types: ['japanese_restaurant', 'sushi_restaurant'] },
  { id: 'marmitaria', label: 'Marmitaria e delivery', grupo: 'Alimentacao', types: ['meal_delivery', 'meal_takeaway', 'food_delivery'] },
  { id: 'buffet', label: 'Buffet e eventos', grupo: 'Alimentacao', types: ['catering_service', 'buffet_restaurant'] },

  // Comercio
  { id: 'loja-roupas', label: 'Loja de roupas', grupo: 'Comercio', types: ['clothing_store', 'womens_clothing_store', 'sportswear_store'] },
  { id: 'calcados', label: 'Loja de calcados', grupo: 'Comercio', types: ['shoe_store'] },
  { id: 'joalheria', label: 'Joalheria e otica', grupo: 'Comercio', types: ['jewelry_store'] },
  { id: 'cosmeticos', label: 'Perfumaria e cosmeticos', grupo: 'Comercio', types: ['cosmetics_store'] },
  { id: 'moveis', label: 'Moveis e decoracao', grupo: 'Comercio', types: ['furniture_store', 'home_goods_store'] },
  { id: 'material-construcao', label: 'Material de construcao', grupo: 'Comercio', types: ['building_materials_store', 'hardware_store', 'home_improvement_store'] },
  { id: 'petshop', label: 'Pet shop', grupo: 'Comercio', types: ['pet_store', 'pet_care', 'pet_boarding_service'] },
  { id: 'celulares', label: 'Celulares e assistencia', grupo: 'Comercio', types: ['cell_phone_store', 'electronics_store'] },
  { id: 'mercado', label: 'Mercado e minimercado', grupo: 'Comercio', types: ['grocery_store', 'supermarket', 'convenience_store'] },
  { id: 'floricultura', label: 'Floricultura', grupo: 'Comercio', types: ['florist', 'garden_center'] },
  { id: 'bicicletaria', label: 'Bicicletaria', grupo: 'Comercio', types: ['bicycle_store'] },
  { id: 'artigos-esportivos', label: 'Artigos esportivos', grupo: 'Comercio', types: ['sporting_goods_store'] },
  { id: 'presentes', label: 'Presentes e papelaria', grupo: 'Comercio', types: ['gift_shop', 'book_store', 'toy_store'] },

  // Automotivo
  { id: 'oficina', label: 'Oficina mecanica', grupo: 'Automotivo', types: ['car_repair'] },
  { id: 'lava-rapido', label: 'Lava rapido e estetica automotiva', grupo: 'Automotivo', types: ['car_wash'] },
  { id: 'autopecas', label: 'Auto pecas', grupo: 'Automotivo', types: ['auto_parts_store'] },
  { id: 'borracharia', label: 'Borracharia e pneus', grupo: 'Automotivo', types: ['tire_shop'] },
  { id: 'revenda-veiculos', label: 'Revenda de veiculos', grupo: 'Automotivo', types: ['car_dealer', 'car_rental'] },

  // Fitness
  { id: 'academia', label: 'Academia', grupo: 'Fitness', types: ['gym', 'fitness_center'] },
  { id: 'crossfit', label: 'Crossfit e box', grupo: 'Fitness', types: ['sports_complex', 'sports_activity_location'] },
  { id: 'artes-marciais', label: 'Artes marciais', grupo: 'Fitness', types: ['sports_school', 'sports_coaching'] },
  { id: 'pilates-yoga', label: 'Pilates e yoga', grupo: 'Fitness', types: ['yoga_studio'] },
  { id: 'clube', label: 'Clube esportivo', grupo: 'Fitness', types: ['sports_club'] },

  // Servicos profissionais
  { id: 'advocacia', label: 'Advocacia', grupo: 'Servicos profissionais', types: ['lawyer'] },
  { id: 'contabilidade', label: 'Contabilidade e consultoria', grupo: 'Servicos profissionais', types: ['consultant', 'marketing_consultant'] },
  { id: 'imobiliaria', label: 'Imobiliaria', grupo: 'Servicos profissionais', types: ['real_estate_agency'] },
  { id: 'seguros', label: 'Corretora de seguros', grupo: 'Servicos profissionais', types: ['insurance_agency'] },
  { id: 'turismo', label: 'Agencia de turismo', grupo: 'Servicos profissionais', types: ['travel_agency', 'tour_agency'] },
  { id: 'coworking', label: 'Coworking e escritorios', grupo: 'Servicos profissionais', types: ['coworking_space', 'business_center'] },
  { id: 'rh', label: 'Recursos humanos', grupo: 'Servicos profissionais', types: ['employment_agency'] },

  // Servicos gerais
  { id: 'lavanderia', label: 'Lavanderia', grupo: 'Servicos gerais', types: ['laundry'] },
  { id: 'costura', label: 'Costura e ajustes', grupo: 'Servicos gerais', types: ['tailor'] },
  { id: 'chaveiro', label: 'Chaveiro', grupo: 'Servicos gerais', types: ['locksmith'] },
  { id: 'reformas', label: 'Reformas e manutencao', grupo: 'Servicos gerais', types: ['plumber', 'electrician', 'painter', 'roofing_contractor'] },
  { id: 'mudancas', label: 'Mudancas e transporte', grupo: 'Servicos gerais', types: ['moving_company', 'courier_service', 'shipping_service'] },
  { id: 'funeraria', label: 'Funeraria', grupo: 'Servicos gerais', types: ['funeral_home'] },

  // Educacao
  { id: 'escola', label: 'Escola', grupo: 'Educacao', types: ['school', 'primary_school', 'secondary_school'] },
  { id: 'creche', label: 'Creche e educacao infantil', grupo: 'Educacao', types: ['preschool', 'child_care_agency'] },
  { id: 'faculdade', label: 'Faculdade e pos', grupo: 'Educacao', types: ['university', 'educational_institution'] },

  // Hospedagem
  { id: 'hotel', label: 'Hotel e pousada', grupo: 'Hospedagem', types: ['hotel', 'motel', 'guest_house', 'bed_and_breakfast', 'inn'] },
  { id: 'hostel', label: 'Hostel', grupo: 'Hospedagem', types: ['hostel'] },
];

const PORTIPO = new Map(NICHOS.map((n) => [n.id, n]));

export function acharNicho(id: string): Nicho | undefined {
  return PORTIPO.get(id);
}

/** Agrupa para montar o `<select>` com `<optgroup>`. */
export function nichosPorGrupo(): Array<{ grupo: string; nichos: Nicho[] }> {
  const mapa = new Map<string, Nicho[]>();
  for (const n of NICHOS) {
    const lista = mapa.get(n.grupo);
    if (lista) lista.push(n);
    else mapa.set(n.grupo, [n]);
  }
  return [...mapa].map(([grupo, nichos]) => ({ grupo, nichos }));
}
