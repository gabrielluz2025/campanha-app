import { useState, useEffect } from 'react'
import { MapContainer, TileLayer, Marker, Popup, Polyline, useMap, GeoJSON } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import {
  MapPin, Route, Loader2,
  Navigation2, ChevronUp, ChevronDown, Church,
  RotateCcw, Clock, Pencil, Save, X, User, Map, Layers,
  CheckCircle, Star, MessageSquare, AlertCircle, Plus, Filter, BarChart2,
} from 'lucide-react'

delete L.Icon.Default.prototype._getIconUrl
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl:       'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl:     'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
})

const BLUMENAU = [-26.9194, -49.0661]
const BOUNDS   = [[-27.3, -49.5], [-26.6, -48.7]]

export const DENOMINACAO_PADRAO = 'Assembleia de Deus'
export const DENOMINACOES = [
  'Assembleia de Deus',
  'Batista',
  'Presbiteriana',
  'Metodista',
  'Adventista',
  'Igreja Católica',
  'Universal',
  'Congregação Cristã',
  'Outra',
]
export const COR_DENOMINACAO = {
  'Assembleia de Deus': '#2563eb',
  'Batista': '#3b82f6',
  'Presbiteriana': '#f59e0b',
  'Metodista': '#ec4899',
  'Adventista': '#10b981',
  'Igreja Católica': '#f97316',
  'Universal': '#06b6d4',
  'Congregação Cristã': '#06b6d4',
  'Outra': '#8b5cf6',
}

const SETORES = {
  'Sede':              '#3b82f6',
  'Garcia':            '#f97316',
  'Badenfurt':         '#10b981',
  'Fortaleza':         '#06b6d4',
  'Escola Agrícola':   '#f59e0b',
  'Velha Central':     '#ec4899',
  'Itoupava Central':  '#06b6d4',
  'Betânia':           '#14b8a6',
  'Nova Jerusalém':    '#22d3ee',
  'Betesda':           '#84cc16',
  'Velha Grande':      '#f43f5e',
  'Progresso':         '#2563eb',
  'Jerusalém':         '#d97706',
  'Araranguá':         '#059669',
  'Itoupava Norte':    '#dc2626',
  'Morell':            '#0891b2',
  'Vila Itoupava':     '#0891b2',
  'Moriá':             '#65a30d',
  'Água Verde':        '#0d9488',
  'América do Sol':    '#db2777',
  'Missões':           '#9333ea',
  'Cidade Jardim':     '#16a34a',
  'Pérola do Vale':    '#ca8a04',
  'Ristow':            '#b45309',
  'Jordão':            '#1d4ed8',
  'Pedro Krauss':      '#15803d',
  'Itoupavazinha':     '#b91c1c',
  'Pôr do Sol':        '#c2410c',
  'Monte Hermom':      '#6d28d9',
  'Nova Esperança':    '#0369a1',
  'Frederico Jensen':  '#a16207',
  'Via Moinho':        '#047857',
}

export const MAX_ID_BASE = 88
export const MAX_ID_EXTERNAS = 1999

export const IGREJAS_BASE = [
  { id:1,  lat:-26.9185,lng:-49.0693, nome:'Sede',               setor:'Sede',            foto:'/fotos/sede.jpg',               endereco:'Rua São Paulo, 890 - Victor Konder, Blumenau - SC',                    culto:'Dom 10:00/19:00 · Ter 19:30 · Qui 19:30' },
  { id:2,  lat:-26.9362,lng:-49.0524, nome:'Garcia',             setor:'Garcia',          foto:'/fotos/garcia.jpg',             endereco:'Rua Amazonas, 4243 - Garcia, Blumenau - SC',                           culto:'Dom 18:30 · Ter 19:30 · Qui 19:30' },
  { id:3,  lat:-26.9442,lng:-49.0562, nome:'Zendron',            setor:'Garcia',          foto:'/fotos/zendron.jpg',            endereco:'Rua Antônio Zendron, 2070 - Valparaíso, Blumenau - SC',                culto:'Dom 18:30 · Qua 19:30' },
  { id:4,  lat:-26.9395,lng:-49.0530, nome:'Glória',             setor:'Garcia',          foto:'/fotos/gloria.jpg',             endereco:'Rua Brusque, 615 - Glória, Blumenau - SC',                             culto:'Dom 18:30 · Qua 19:30' },
  { id:5,  lat:-26.9315,lng:-49.0542, nome:'Itapuí',             setor:'Garcia',          foto:'/fotos/itapui.jpg',             endereco:'Rua Carlos Splitter, 63 - Garcia, Blumenau - SC',                      culto:'Dom 18:30 · Qua 19:30' },
  { id:6,  lat:-26.9350,lng:-49.0512, nome:'Eng. Odebrecht',     setor:'Garcia',          foto:'/fotos/eng-odebrecht.jpg',      endereco:'Rua Engenheiro Odebrecht, 695 - Garcia, Blumenau - SC',                culto:'Dom 18:30 · Qua 19:30' },
  { id:7,  lat:-26.9350,lng:-48.9500, nome:'Emaús',              setor:'Garcia',          foto:'/fotos/emaus.jpg',              endereco:'Rua Professor Osório de Carvalho, 320 - Gaspar Alto, Gaspar - SC',     culto:'Dom 18:30 · Qua 19:30' },
  { id:8,  lat:-26.8895,lng:-49.1182, nome:'Badenfurt',          setor:'Badenfurt',       foto:'/fotos/badenfurt.jpg',          endereco:'Rua Johann Sachse, 130 - Badenfurt, Blumenau - SC',                    culto:'Dom 18:30 · Qui 19:30' },
  { id:9,  lat:-26.8830,lng:-49.1220, nome:'Heinrich Hemmer',    setor:'Badenfurt',       foto:'/fotos/heinrich-hemmer.jpg',    endereco:'Rua Heinrich Hemmer, 1794 - Badenfurt, Blumenau - SC',                 culto:'Dom 19:00 · Qua 19:30' },
  { id:10, lat:-26.8910,lng:-49.1150, nome:'Balsa',              setor:'Badenfurt',       foto:'/fotos/balsa.jpg',              endereco:'Rua Andorra, 46 - Badenfurt, Blumenau - SC',                           culto:'Dom 18:30 · Qua 19:30' },
  { id:11, lat:-26.8730,lng:-49.1080, nome:'Ilha do Salto',      setor:'Badenfurt',       foto:'/fotos/ilha-do-salto.jpg',      endereco:'Rua João Batista Zandonai, 80 - Salto Norte, Blumenau - SC',           culto:'Dom 18:30 · Qua 19:30' },
  { id:12, lat:-26.8550,lng:-49.1350, nome:'Testo Salto',        setor:'Badenfurt',       foto:'/fotos/testo-salto.jpg',        endereco:'Rua Bernardo Scheidemantel, 1340 - Testo Salto, Blumenau - SC',        culto:'Dom 18:30 · Qua 19:30' },
  { id:13, lat:-26.9020,lng:-49.0650, nome:'Fortaleza',          setor:'Fortaleza',       foto:'/fotos/fortaleza.jpg',          endereco:'Rua Galileu Galilei, 79 - Fortaleza, Blumenau - SC',                   culto:'Dom 8:30/19:00 · Ter 19:30 · Qui 19:30' },
  { id:14, lat:-26.8670,lng:-49.0500, nome:'Sete de Maio',       setor:'Fortaleza',       foto:'/fotos/sete-de-maio.jpg',       endereco:'Rua 7 de Maio, 613 - Itoupava Norte, Blumenau - SC',                   culto:'Dom 18:30 · Ter 19:30 · Qua 19:30' },
  { id:15, lat:-26.8800,lng:-49.0260, nome:'Shalon',             setor:'Fortaleza',       foto:'/fotos/shalon.jpg',             endereco:'Rua Hermann Tribess, 2028 - Tribess, Blumenau - SC',                   culto:'Dom 18:30 · Ter 19:30 · Qua 19:30' },
  { id:16, lat:-26.8970,lng:-49.1040, nome:'Escola Agrícola',    setor:'Escola Agrícola', foto:'/fotos/escola-agricola.jpg',    endereco:'Rua José Deeke, 909 - Escola Agrícola, Blumenau - SC',                 culto:'Dom 10:00/19:00 · Ter 19:30 · Qui 19:30' },
  { id:17, lat:-26.8900,lng:-49.1380, nome:'Salto Weissbach',    setor:'Escola Agrícola', foto:'/fotos/salto-weissbach.jpg',    endereco:'Rua Bahia, 5899 - Salto Weissbach, Blumenau - SC',                     culto:'Dom 19:00 · Ter 19:30 · Qua 19:30' },
  { id:18, lat:-26.8990,lng:-49.1020, nome:'Coripós',            setor:'Escola Agrícola', foto:'/fotos/coripos.jpg',            endereco:'Rua Coripós, 945 - Escola Agrícola, Blumenau - SC',                    culto:'Dom 19:00 · Ter 19:30 · Qua 19:30' },
  { id:19, lat:-26.9270,lng:-49.0465, nome:'Velha Central',      setor:'Velha Central',   foto:'/fotos/velha-central.jpg',      endereco:'Rua dos Caçadores, 2610 - Velha, Blumenau - SC',                       culto:'Dom 18:30 · Qui 19:30' },
  { id:20, lat:-26.9260,lng:-49.0480, nome:'Betel',              setor:'Velha Central',   foto:'/fotos/betel.jpg',              endereco:'Rua Bruno Rudiger, 459 - Velha Central, Blumenau - SC',                culto:'Dom 18:30 · Qua 19:30' },
  { id:21, lat:-26.9240,lng:-49.0450, nome:'Araucária',          setor:'Velha Central',   foto:'/fotos/araucaria.jpg',          endereco:'Rua Araucária, 238 - Velha, Blumenau - SC',                            culto:'Dom 18:30 · Sex 19:30' },
  { id:22, lat:-26.8720,lng:-49.0540, nome:'Itoupava Central',   setor:'Itoupava Central',foto:'/fotos/itoupava-central.jpg',   endereco:'Rua Dr. Pedro Zimmermann, 3449 - Itoupava Central, Blumenau - SC',     culto:'Dom 18:30 · Qui 19:30' },
  { id:23, lat:-26.9410,lng:-49.0625, nome:'Betânia',            setor:'Betânia',         foto:'/fotos/betania.jpg',            endereco:'Rua Konrad Adenauer, 50 - Ponta Aguda, Blumenau - SC',                 culto:'Dom 18:30 · Qui 19:30' },
  { id:24, lat:-26.9640,lng:-49.0230, nome:'Margem Esquerda',    setor:'Betânia',         foto:'/fotos/margem-esquerda.jpg',    endereco:'Rua Antonio Benedito de Amorim, 955 - Belchior Baixo, Gaspar - SC',   culto:'Dom 18:30 · Qua 19:30' },
  { id:25, lat:-26.9420,lng:-49.0620, nome:'Monte Horebe',       setor:'Betânia',         foto:'/fotos/monte-horebe.jpg',       endereco:'Rua Gênova, 50 - Ponta Aguda, Blumenau - SC',                          culto:'Dom 18:30 · Qua 19:30' },
  { id:26, lat:-26.9435,lng:-49.0610, nome:'Monte Sião',         setor:'Betânia',         foto:'/fotos/monte-siao.jpg',         endereco:'Rua José Isidoro Corrêa, 102 - Ponta Aguda, Blumenau - SC',           culto:'Dom 18:30 · Qua 19:30' },
  { id:27, lat:-26.9100,lng:-49.0352, nome:'Nova Jerusalém',     setor:'Nova Jerusalém',  foto:'/fotos/nova-jerusalem.jpg',     endereco:'Rua Godofredo Rangel, 30 - Fidélis, Blumenau - SC',                    culto:'Dom 18:30 · Qui 19:30' },
  { id:28, lat:-26.9030,lng:-49.0590, nome:'Fidélis',            setor:'Nova Jerusalém',  foto:'/fotos/fidelis.jpg',            endereco:'Rua Theodoro Pasold, 3159 - Fortaleza, Blumenau - SC',                 culto:'Dom 18:30 · Qua 19:30' },
  { id:29, lat:-26.9120,lng:-49.0340, nome:'Morro da Laguna',    setor:'Nova Jerusalém',  foto:'/fotos/morro-da-laguna.jpg',    endereco:'Rua Rogério Haag, 55 - Fidélis, Blumenau - SC',                        culto:'Dom 18:30 · Qua 19:00' },
  { id:30, lat:-26.8680,lng:-49.0520, nome:'Betesda',            setor:'Betesda',         foto:'/fotos/betesda.jpg',            endereco:'Rua Gustavo Zimmermann, 6991 - Itoupava Central, Blumenau - SC',       culto:'Dom 18:30 · Qui 19:30' },
  { id:31, lat:-26.8710,lng:-49.0535, nome:'Belém',              setor:'Betesda',         foto:'/fotos/belem.jpg',              endereco:'Rua Paulo Zingel, 1180 - Itoupava Central, Blumenau - SC',             culto:'Dom 18:30 · Qua 19:30' },
  { id:32, lat:-26.9310,lng:-49.0975, nome:'Velha Grande',       setor:'Velha Grande',    foto:'/fotos/velha-grande.jpg',       endereco:'Rua Rodolfo Frotschner, 203 - Velha Grande, Blumenau - SC',            culto:'Dom 18:00 · Qua 19:30 · Sex 19:30' },
  { id:33, lat:-26.9330,lng:-49.0990, nome:'Muth',               setor:'Velha Grande',    foto:'/fotos/muth.jpg',               endereco:'Rua Emil Wehmuth, 534 - Velha Grande, Blumenau - SC',                  culto:'Dom 18:00 · Ter 19:30' },
  { id:34, lat:-26.9375,lng:-49.1030, nome:'Hermann Kratz',      setor:'Velha Grande',    foto:'/fotos/hermann-kratz.jpg',      endereco:'Rua Herman Kratz, 1365 - Velha Grande, Blumenau - SC',                 culto:'Dom 18:00 · Ter 19:30' },
  { id:35, lat:-26.9290,lng:-49.0960, nome:'Figueira',           setor:'Velha Grande',    foto:'/fotos/figueira.jpg',           endereco:'Rua da Figueira, 19 - Velha Grande, Blumenau - SC',                    culto:'Dom 18:00 · Ter 19:30' },
  { id:36, lat:-26.9322,lng:-49.0983, nome:'Dona Edite',         setor:'Velha Grande',    foto:'/fotos/dona-edite.jpg',         endereco:'Rua da Comunidade, 128 - Velha Grande, Blumenau - SC',                 culto:'Dom 18:00 · Ter 19:30' },
  { id:37, lat:-26.9700,lng:-49.0450, nome:'El Shadai',          setor:'Progresso',       foto:'/fotos/el-shadai.jpg',          endereco:'Rua Gregório Henrique da Silva, S/N - Progresso, Blumenau - SC',       culto:'Dom 18:30 · Qua 19:30' },
  { id:38, lat:-26.9720,lng:-49.0430, nome:'Gustavo Maier',      setor:'Progresso',       foto:'/fotos/gustavo-maier.jpg',      endereco:'Rua Francisco Manoel dos Santos, S/N - Progresso, Blumenau - SC',      culto:'Dom 18:30 · Qua 19:30' },
  { id:39, lat:-26.9680,lng:-49.0410, nome:'Progresso',          setor:'Progresso',       foto:'/fotos/progresso.jpg',          endereco:'Rua Rui Barbosa, 500 - Progresso, Blumenau - SC',                      culto:'Dom 18:30 · Qui 19:30' },
  { id:40, lat:-26.8960,lng:-49.1035, nome:'Jerusalém',          setor:'Jerusalém',       foto:'/fotos/jerusalem.jpg',          endereco:'Rua Frei Estanislau Schaette, 765 - Escola Agrícola, Blumenau - SC',   culto:'Dom 10:00/18:30 · Qui 19:30' },
  { id:41, lat:-26.9060,lng:-49.0830, nome:'Eça de Queiroz',     setor:'Jerusalém',       foto:'/fotos/eca-de-queiroz.jpg',     endereco:'Rua Eça de Queiroz, 790 - Água Verde, Blumenau - SC',                  culto:'Dom 18:30 · Qua 19:30' },
  { id:42, lat:-26.9230,lng:-49.0445, nome:'Velha João Pessoa',  setor:'Jerusalém',       foto:'/fotos/velha-joao-pessoa.jpg',  endereco:'Rua João Pessoa, 2511 - Velha, Blumenau - SC',                         culto:'Dom 18:30 · Qua 19:30' },
  { id:43, lat:-26.9180,lng:-49.0570, nome:'Vila Nova',          setor:'Jerusalém',       foto:'/fotos/vila-nova.jpg',          endereco:'Rua Prudente de Moraes, 326 - Vila Nova, Blumenau - SC',               culto:'Dom 18:30 · Qua 19:30' },
  { id:44, lat:-26.9370,lng:-49.0530, nome:'Araranguá',          setor:'Araranguá',       foto:'/fotos/ararangua.jpg',          endereco:'Rua Araranguá, 1151 - Garcia, Blumenau - SC',                          culto:'Dom 18:30 · Qua 19:30' },
  { id:45, lat:-26.9980,lng:-49.0700, nome:'Morro da Garuva',    setor:'Araranguá',       foto:'/fotos/morro-da-garuva.jpg',    endereco:'Rua Benigno Joaquim dos Santos, 29 - Ribeirão Fresco, Blumenau - SC',  culto:'Dom 18:30 · Qui 19:30' },
  { id:46, lat:-26.9340,lng:-49.0545, nome:'Morro da Antena',    setor:'Araranguá',       foto:'/fotos/morro-da-antena.jpg',    endereco:'Rua Antônio Sofiati, 27 - Garcia, Blumenau - SC',                      culto:'Dom 18:30 · Qui 19:30' },
  { id:47, lat:-26.9960,lng:-49.0720, nome:'Pastor Oswald Hesse',setor:'Araranguá',       foto:'/fotos/pastor-oswald-hesse.jpg',endereco:'Rua Pastor Oswald Hesse, 526 - Ribeirão Fresco, Blumenau - SC',        culto:'Dom 18:30 · Qui 19:30' },
  { id:48, lat:-26.8620,lng:-49.0480, nome:'Itoupava Norte',     setor:'Itoupava Norte',  foto:'/fotos/itoupava-norte.jpg',     endereco:'Rua 25 de Agosto, 34 - Itoupava Norte, Blumenau - SC',                 culto:'Dom 18:30 · Qui 19:30' },
  { id:49, lat:-26.8640,lng:-49.0460, nome:'Dois de Setembro',   setor:'Itoupava Norte',  foto:'/fotos/dois-de-setembro.jpg',   endereco:'Rua Dois de Setembro, 2093 - Itoupava Norte, Blumenau - SC',           culto:'Dom 18:30 · Sex 19:30' },
  { id:50, lat:-26.8520,lng:-49.1310, nome:'Morell',             setor:'Morell',          foto:'/fotos/morell.jpg',             endereco:'Rua Christiano Karsten, 1295 - Testo Salto, Blumenau - SC',            culto:'Dom 18:00 · Ter 19:30 · Qui 19:00' },
  { id:51, lat:-26.8540,lng:-49.1290, nome:'Philipp Bauler',     setor:'Morell',          foto:'/fotos/philipp-bauler.jpg',     endereco:'R. Philipp Bauler, 1267 - Testo Salto, Blumenau - SC',                 culto:'Dom 18:00 · Qua 19:00' },
  { id:52, lat:-26.7870,lng:-49.1050, nome:'Vila Itoupava',      setor:'Vila Itoupava',   foto:'/fotos/vila-itoupava.jpg',      endereco:'Rua Dr. Pedro Zimmermann, 16170 - Vila Itoupava, Blumenau - SC',       culto:'Dom 18:00 · Qui 19:30' },
  { id:53, lat:-26.8000,lng:-49.1100, nome:'Itoupava Rega',      setor:'Vila Itoupava',   foto:'/fotos/itoupava-rega.jpg',      endereco:'Rua Erwin Manzke, 14311 - Vila Itoupava, Blumenau - SC',               culto:'Dom 18:30 · Qua 19:30' },
  { id:54, lat:-26.8910,lng:-49.0580, nome:'Moriá',              setor:'Moriá',           foto:'/fotos/moria.jpg',              endereco:'Rua Francisco Vahldieck, 4613 - Fortaleza Alta, Blumenau - SC',        culto:'Dom 18:30 · Qui 19:30' },
  { id:55, lat:-26.9720,lng:-49.0190, nome:'Belchior Alto',      setor:'Moriá',           foto:'/fotos/belchior-alto.jpg',      endereco:'Rua Bonifácio Haendchen, 4130 - Belchior Alto, Gaspar - SC',           culto:'Dom 18:30 · Qua 19:30' },
  { id:56, lat:-26.9040,lng:-49.0835, nome:'Água Verde',         setor:'Água Verde',      foto:'/fotos/agua-verde.jpg',         endereco:'Rua Guilherme Poerner, 129 - Água Verde, Blumenau - SC',               culto:'Dom 19:00 · Qui 19:30' },
  { id:57, lat:-26.9110,lng:-49.0910, nome:'Passo Manso',        setor:'Água Verde',      foto:'/fotos/passo-manso.jpg',        endereco:'Rua Elvira Bornhofen, 51 - Passo Manso, Blumenau - SC',                culto:'Dom 18:30 · Qua 19:30' },
  { id:58, lat:-26.9130,lng:-49.0930, nome:'Ribeirão Branco',    setor:'Água Verde',      foto:'/fotos/ribeirao-branco.jpg',    endereco:'Rua Bruno Seibt, 246 - Passo Manso, Blumenau - SC',                    culto:'Dom 18:30 · Qua 19:30' },
  { id:59, lat:-26.9285,lng:-49.0500, nome:'Três Lagoas',        setor:'Água Verde',      foto:'/fotos/tres-lagoas.jpg',        endereco:'Rua Bernardo Reiter, 1611 - Velha Central, Blumenau - SC',             culto:'Dom 18:30 · Qua 19:30' },
  { id:60, lat:-26.8900,lng:-49.0310, nome:'América do Sol',     setor:'América do Sol',  foto:'/fotos/america-do-sol.jpg',     endereco:'Rua Frederico Jensen, 3511 - Itoupavazinha, Blumenau - SC',            culto:'Dom 19:00 · Qui 19:30' },
  { id:61, lat:-26.8730,lng:-49.0555, nome:'Milano',             setor:'América do Sol',  foto:'/fotos/milano.jpg',             endereco:'Rua Prof. Jacob Ineichen, 1341 - Itoupava Central, Blumenau - SC',     culto:'Dom 18:30 · Qua 19:30' },
  { id:62, lat:-26.8920,lng:-49.0295, nome:'Libertadores',       setor:'América do Sol',  foto:'/fotos/libertadores.jpg',       endereco:'Rua Frederico Bohringer, 754 - Itoupavazinha, Blumenau - SC',          culto:'Dom 18:30 · Qua 19:30' },
  { id:63, lat:-26.9450,lng:-49.0640, nome:'Missões',            setor:'Missões',         foto:'/fotos/missoes.jpg',            endereco:'Rua Dep. Walter Vicente Gomes, 110 - Ponta Aguda, Blumenau - SC',      culto:'Dom 18:30 · Qui 19:30' },
  { id:64, lat:-26.9140,lng:-49.0610, nome:'Boa Vista',          setor:'Missões',         foto:'/fotos/boa-vista.jpg',          endereco:'Rua Frederico Deeke, 292 - Boa Vista, Blumenau - SC',                  culto:'Dom 18:30 · Qua 19:30' },
  { id:65, lat:-26.8870,lng:-49.1165, nome:'Cidade Jardim',      setor:'Cidade Jardim',   foto:'/fotos/cidade-jardim.jpg',      endereco:'Rua Dorival Moraes, 105 - Badenfurt, Blumenau - SC',                   culto:'Dom 18:30 · Qui 19:30' },
  { id:66, lat:-26.8695,lng:-49.0545, nome:'Pérola do Vale',     setor:'Pérola do Vale',  foto:'/fotos/perola-do-vale.jpg',     endereco:'Rua Gustavo Zimmermann, 2001 - Itoupava Central, Blumenau - SC',       culto:'Dom 10:15/18:30 · Qui 19:45' },
  { id:67, lat:-26.8705,lng:-49.0530, nome:'Três Coqueiros',     setor:'Pérola do Vale',  foto:'/fotos/tres-coqueiros.jpg',     endereco:'Rua George Fridrich Mordhorst, 29 - Itoupava Central, Blumenau - SC',  culto:'Dom 18:30 · Qua 19:45' },
  { id:68, lat:-26.9295,lng:-49.0510, nome:'Ristow',             setor:'Ristow',          foto:'/fotos/ristow.jpg',             endereco:'Rua José Reuter, 3246 - Velha Central, Blumenau - SC',                 culto:'Dom 19:00 · Qui 19:30' },
  { id:69, lat:-26.9275,lng:-49.0490, nome:'Hermann Barthel',    setor:'Ristow',          foto:'/fotos/hermann-barthel.jpg',    endereco:'Rua Isabel de Souza Marciano, 61 - Velha Central, Blumenau - SC',      culto:'Dom 19:00 · Qua 19:30' },
  { id:70, lat:-26.8530,lng:-49.1720, nome:'Siloé',              setor:'Ristow',          foto:'/fotos/siloe.jpg',              endereco:'Rua Tifa da Linguiça, 700 - Encano, Indaial - SC',                     culto:'Dom 18:30 · Qua 19:30' },
  { id:71, lat:-26.9690,lng:-49.0420, nome:'Jordão',             setor:'Jordão',          foto:'/fotos/jordao.jpg',             endereco:'Rua Jordão, 239 - Progresso, Blumenau - SC',                           culto:'Dom 18:30 · Qui 19:30' },
  { id:72, lat:-26.9710,lng:-49.0395, nome:'Canto do Rio',       setor:'Jordão',          foto:'/fotos/canto-do-rio.jpg',       endereco:'Rua Santa Maria, 1119 - Progresso, Blumenau - SC',                     culto:'Dom 18:30 · Qua 19:30' },
  { id:73, lat:-26.9725,lng:-49.0412, nome:'Filadélfia',         setor:'Jordão',          foto:'/fotos/filadelfia.jpg',         endereco:'Rua Belmiro Colzani, 407 - Progresso, Blumenau - SC',                  culto:'Dom 18:30 · Qua 19:30' },
  { id:74, lat:-26.9310,lng:-49.0610, nome:'Pedro Krauss',       setor:'Pedro Krauss',    foto:'/fotos/pedro-krauss.jpg',       endereco:'Rua Pedro Krauss Sênior, 455 - Vorstadt, Blumenau - SC',               culto:'Dom 18:00 · Qui 19:30' },
  { id:75, lat:-26.9325,lng:-49.0625, nome:'Rua Itajaí',         setor:'Pedro Krauss',    foto:'/fotos/rua-itajai.jpg',         endereco:'Rua Itajaí, 5140 - Vorstadt, Blumenau - SC',                           culto:'Dom 18:30 · Qua 19:00' },
  { id:76, lat:-26.9300,lng:-49.0590, nome:'Vorstadt',           setor:'Pedro Krauss',    foto:'/fotos/vorstadt.jpg',           endereco:'Rua Sebastião Voss, 230 - Vorstadt, Blumenau - SC',                    culto:'Dom 18:30 · Qua 19:00' },
  { id:77, lat:-26.9940,lng:-49.0735, nome:'Boa Esperança',      setor:'Pedro Krauss',    foto:'/fotos/boa-esperanca.jpg',      endereco:'Rua Boa Esperança, 260 - Ribeirão Fresco, Blumenau - SC',              culto:'Dom 18:30 · Qua 19:30' },
  { id:78, lat:-26.8880,lng:-49.0320, nome:'Itoupavazinha',      setor:'Itoupavazinha',   foto:'/fotos/itoupavazinha.jpg',      endereco:'Rua Henrique Mette, 456 - Itoupavazinha, Blumenau - SC',               culto:'Dom 10:00/18:30 · Ter 19:30 · Qui 19:30' },
  { id:79, lat:-26.8720,lng:-49.0380, nome:'Salto do Norte',     setor:'Itoupavazinha',   foto:'/fotos/salto-do-norte.jpg',     endereco:'Rua Gustavo Frank, 105 - Salto Norte, Blumenau - SC',                  culto:'Dom 18:30 · Ter 19:30 · Qua 19:30' },
  { id:80, lat:-26.8760,lng:-49.0550, nome:'Pôr do Sol',         setor:'Pôr do Sol',      foto:'/fotos/por-do-sol.jpg',         endereco:'Rua Alex Borchardt, 774 - Itoupava Central, Blumenau - SC',            culto:'Dom 10:00/18:00 · Qui 19:30' },
  { id:81, lat:-26.8650,lng:-49.0490, nome:'Monte Hermom',       setor:'Monte Hermom',    foto:'/fotos/monte-hermom.jpg',       endereco:'Rua Lidia Correa Tobias, 293 - Itoupava Norte, Blumenau - SC',         culto:'Dom 18:30 · Qui 19:30' },
  { id:82, lat:-26.9010,lng:-49.0660, nome:'Nova Canaã',         setor:'Monte Hermom',    foto:'/fotos/nova-canaa.jpg',         endereco:'Rua Fritz Koegler, 809 - Fortaleza, Blumenau - SC',                    culto:'Dom 18:30 · Qua 19:30' },
  { id:83, lat:-26.8860,lng:-49.0235, nome:'Nova Esperança',     setor:'Nova Esperança',  foto:'/fotos/nova-esperanca.jpg',     endereco:'Rua Salete, 22 - Nova Esperança, Blumenau - SC',                       culto:'Dom 18:30 · Qui 19:30' },
  { id:84, lat:-26.8820,lng:-49.0220, nome:'Vale da Bênção',     setor:'Nova Esperança',  foto:'/fotos/vale-da-bencao.jpg',     endereco:'Rua Augusto Groh, 613 - Tribess, Gaspar - SC',                         culto:'Dom 18:30 · Qua 19:30' },
  { id:85, lat:-26.8910,lng:-49.0290, nome:'Frederico Jensen',   setor:'Frederico Jensen',foto:'/fotos/frederico-jensen.jpg',   endereco:'Rua Frederico Jensen, 760 - Itoupavazinha, Blumenau - SC',             culto:'Dom 18:30 · Qui 19:30' },
  { id:86, lat:-26.8895,lng:-49.0305, nome:'Botuverá',           setor:'Frederico Jensen',foto:'/fotos/botuvera.jpg',           endereco:'Rua Sibéria, 45 - Itoupavazinha, Blumenau - SC',                       culto:'Dom 18:30 · Qua 19:30' },
  { id:87, lat:-26.8645,lng:-49.0565, nome:'Via Moinho',         setor:'Via Moinho',      foto:'/fotos/via-moinho.jpg',         endereco:'Rua Professor Jacob Ineichen, 6405 - Itoupava Central, Blumenau - SC', culto:'Dom 18:00 · Qua 19:30 · Sex 19:30' },
  { id:88, lat:-26.8660,lng:-49.0560, nome:'Eldrita Krueger',    setor:'Via Moinho',      foto:'/fotos/eldrita-krueger.jpg',    endereco:'Rua Eldrita Krueger, 55 - Itoupava Central, Blumenau - SC',            culto:'Dom 18:30 · Qua 19:30' },
]

export const IGREJAS_EXTERNAS = [
  { id:1000, lat:-26.9269, lng:-49.0470, nome:'Igreja Nova Vida Blumenau', setor:'Velha', denominacao:'Outra', endereco:'ITAPIRANGA, 249, Velha - Blumenau - SC', culto:'', pastor1:'', esposa1:'', pastor2:'', esposa2:'', telefone:'47992609997', foto:'/fotos/sem-foto.jpg' },
  { id:1001, lat:-26.8720, lng:-49.0548, nome:'Igreja Pentecostal de Jesus Cristo', setor:'Itoupava Central', denominacao:'Outra', endereco:'PEDRO ZIMERMANN, 2720, Itoupava Central - Blumenau - SC', culto:'', pastor1:'', esposa1:'', pastor2:'', esposa2:'', telefone:'', foto:'/fotos/sem-foto.jpg' },
  { id:1002, lat:-26.8505, lng:-49.1321, nome:'Deus é Amor', setor:'Salto', denominacao:'Outra', endereco:'RUA BAHIA, 2955, Salto - Blumenau - SC', culto:'', pastor1:'', esposa1:'', pastor2:'', esposa2:'', telefone:'1133474700', foto:'/fotos/sem-foto.jpg' },
  { id:1003, lat:-26.9061, lng:-49.0806, nome:'Do Senhor Jesus/Ministério Viver Blumenau', setor:'Água Verde', denominacao:'Outra', endereco:'Dorval Roncaglio 235, Água Verde - Blumenau - SC', culto:'', pastor1:'Gilberto', esposa1:'', pastor2:'', esposa2:'', telefone:'47 3285-9969', foto:'/fotos/sem-foto.jpg' },
  { id:1004, lat:-26.9069, lng:-49.0846, nome:'Deus do Brasil', setor:'Água Verde', denominacao:'Outra', endereco:'Guilherme poerner 319, Água Verde - Blumenau - SC', culto:'', pastor1:'', esposa1:'', pastor2:'', esposa2:'', telefone:'47 99185-9070', foto:'/fotos/sem-foto.jpg' },
  { id:1005, lat:-26.9039, lng:-49.0812, nome:'Comunidade Evangélica Sara', setor:'Água Verde', denominacao:'Outra', endereco:'Rua São paulo 1698, Água Verde - Blumenau - SC', culto:'', pastor1:'Cláudio', esposa1:'', pastor2:'', esposa2:'', telefone:'47 99687-9321', foto:'/fotos/sem-foto.jpg' },
  { id:1006, lat:-26.9059, lng:-49.0802, nome:'Cristã Renascer', setor:'Água Verde', denominacao:'Outra', endereco:'Eça de Queiróz 281, Água Verde - Blumenau - SC', culto:'', pastor1:'Ederson', esposa1:'', pastor2:'', esposa2:'', telefone:'47 99626-7533', foto:'/fotos/sem-foto.jpg' },
  { id:1007, lat:-26.9079, lng:-49.0831, nome:'Bola de Neve', setor:'Água Verde', denominacao:'Outra', endereco:'Frei Stanislau Schaette 1592, Água Verde - Blumenau - SC', culto:'', pastor1:'Marcimiliano', esposa1:'', pastor2:'', esposa2:'', telefone:'47 99259-8214', foto:'/fotos/sem-foto.jpg' },
  { id:1008, lat:-26.8885, lng:-49.1161, nome:'Pentecostal Missão Apostólica', setor:'Badenfurt', denominacao:'Outra', endereco:'BR 470 km 61, 7260, Badenfurt - Blumenau - SC', culto:'', pastor1:'Ademir', esposa1:'', pastor2:'', esposa2:'', telefone:'47 3334-1847', foto:'/fotos/sem-foto.jpg' },
  { id:1009, lat:-26.9193, lng:-49.0721, nome:'Evangelho Pleno', setor:'Centro', denominacao:'Outra', endereco:'Rua São Paulo 550, Centro - Blumenau - SC', culto:'', pastor1:'Evaldo', esposa1:'', pastor2:'', esposa2:'', telefone:'47 99973-3456', foto:'/fotos/sem-foto.jpg' },
  { id:1010, lat:-26.9195, lng:-49.0714, nome:'Pentecostal de Missões', setor:'Centro', denominacao:'Outra', endereco:'Rua São Paulo 683, Centro - Blumenau - SC', culto:'', pastor1:'Lucas', esposa1:'', pastor2:'', esposa2:'', telefone:'47 99279-0331', foto:'/fotos/sem-foto.jpg' },
  { id:1011, lat:-26.8854, lng:-49.0304, nome:'Apostólica', setor:'Itoupavazinha', denominacao:'Outra', endereco:'Frederico Jesen 3055, Itoupavazinha - Blumenau - SC', culto:'', pastor1:'Amadeu', esposa1:'', pastor2:'', esposa2:'', telefone:'47 99991-6372', foto:'/fotos/sem-foto.jpg' },
  { id:1012, lat:-26.9184, lng:-49.0709, nome:'Cristã do Caminho/Voz de Muitas Águas', setor:'Centro', denominacao:'Outra', endereco:'Sete de setembro 1953, Centro - Blumenau - SC', culto:'', pastor1:'Simone', esposa1:'', pastor2:'', esposa2:'', telefone:'', foto:'/fotos/sem-foto.jpg' },
  { id:1013, lat:-26.9209, lng:-49.0705, nome:'Pentecostal de Jesus Cristo', setor:'Centro', denominacao:'Outra', endereco:'Sete de setembro, esquina com alameda, Centro - Blumenau - SC', culto:'', pastor1:'', esposa1:'', pastor2:'', esposa2:'', telefone:'47 3035-2320', foto:'/fotos/sem-foto.jpg' },
  { id:1014, lat:-26.9193, lng:-49.0700, nome:'Pentecostal Cristo é Vida', setor:'Centro', denominacao:'Outra', endereco:'Sete de setembro 55, Centro - Blumenau - SC', culto:'', pastor1:'Gilmar', esposa1:'', pastor2:'', esposa2:'', telefone:'', foto:'/fotos/sem-foto.jpg' },
  { id:1015, lat:-26.9186, lng:-49.0685, nome:'Igreja Evangélica Cristo é a Esperança', setor:'Centro', denominacao:'Outra', endereco:'Alameda Duque de Caxias 220, Centro - Blumenau - SC', culto:'', pastor1:'Ezequiel', esposa1:'', pastor2:'', esposa2:'', telefone:'47 3339-7071', foto:'/fotos/sem-foto.jpg' },
  { id:1016, lat:-26.9191, lng:-49.0677, nome:'Igreja De Deus Internacional', setor:'Centro', denominacao:'Outra', endereco:'Rua Rodeio 142, Centro - Blumenau - SC', culto:'', pastor1:'Carlos', esposa1:'', pastor2:'', esposa2:'', telefone:'47 3209-0454', foto:'/fotos/sem-foto.jpg' },
  { id:1017, lat:-26.8528, lng:-49.1367, nome:'Igreja Visão Missionária Horto Florestal', setor:'Salto', denominacao:'Outra', endereco:'Rua das Torres 60, Salto - Blumenau - SC', culto:'', pastor1:'Antonio', esposa1:'', pastor2:'', esposa2:'', telefone:'', foto:'/fotos/sem-foto.jpg' },
  { id:1018, lat:-26.8523, lng:-49.1352, nome:'Igreja Pentecostal Deus é Amor', setor:'Salto', denominacao:'Outra', endereco:'Dr. Fritz Muller 737, Salto - Blumenau - SC', culto:'', pastor1:'Arison', esposa1:'', pastor2:'', esposa2:'', telefone:'', foto:'/fotos/sem-foto.jpg' },
  { id:1019, lat:-26.8498, lng:-49.0619, nome:'Igreja Evangélica Verbo da Vida', setor:'Itoupava Seca', denominacao:'Outra', endereco:'Carlos Jensen 150, Itoupava Seca - Blumenau - SC', culto:'', pastor1:'Adalberto', esposa1:'', pastor2:'', esposa2:'', telefone:'47 3288-1922', foto:'/fotos/sem-foto.jpg' },
  { id:1020, lat:-26.9012, lng:-49.0994, nome:'C.P.B Templo da Família', setor:'Escola Agrícola', denominacao:'Outra', endereco:'Maria Balbina Zimmermann 28, Escola Agrícola - Blumenau - SC', culto:'', pastor1:'Elenir', esposa1:'', pastor2:'', esposa2:'', telefone:'47 99263-9547', foto:'/fotos/sem-foto.jpg' },
  { id:1021, lat:-26.8991, lng:-49.1023, nome:'Igreja Deus é Amor', setor:'Escola Agrícola', denominacao:'Outra', endereco:'Rua Coripós 913, Escola Agrícola - Blumenau - SC', culto:'', pastor1:'Donato', esposa1:'', pastor2:'', esposa2:'', telefone:'', foto:'/fotos/sem-foto.jpg' },
  { id:1022, lat:-26.8972, lng:-49.1021, nome:'Igreja Visão Missionária Coripós', setor:'Escola Agrícola', denominacao:'Outra', endereco:'Nicolau Reiter 450, Escola Agrícola - Blumenau - SC', culto:'', pastor1:'Vonceir', esposa1:'', pastor2:'', esposa2:'', telefone:'', foto:'/fotos/sem-foto.jpg' },
  { id:1023, lat:-26.9007, lng:-49.1047, nome:'Igreja 1° Batista Pioneira em Blumenau', setor:'Escola Agrícola', denominacao:'Outra', endereco:'Rua Benjamin Constant 2080, Escola Agrícola - Blumenau - SC', culto:'', pastor1:'Jacques', esposa1:'', pastor2:'', esposa2:'', telefone:'47 3041-0555', foto:'/fotos/sem-foto.jpg' },
  { id:1024, lat:-26.9018, lng:-49.1022, nome:'Igreja Porta da Praça', setor:'Escola Agrícola', denominacao:'Outra', endereco:'Rua Franz Volles, Escola Agrícola - Blumenau - SC', culto:'', pastor1:'Suzana', esposa1:'', pastor2:'', esposa2:'', telefone:'47 99138-8577', foto:'/fotos/sem-foto.jpg' },
  { id:1025, lat:-26.9049, lng:-49.0626, nome:'Igreja Quadrangular', setor:'Fortaleza', denominacao:'Outra', endereco:'Rua Quadrangular 105, Fortaleza - Blumenau - SC', culto:'', pastor1:'Marcos', esposa1:'', pastor2:'', esposa2:'', telefone:'47 3338-9638', foto:'/fotos/sem-foto.jpg' },
  { id:1026, lat:-26.9022, lng:-49.0656, nome:'Igreja Ass. de Deus Ministério Madureira', setor:'Fortaleza', denominacao:'Outra', endereco:'Fritz Koegler 1471, Fortaleza - Blumenau - SC', culto:'', pastor1:'Eleazar', esposa1:'', pastor2:'', esposa2:'', telefone:'', foto:'/fotos/sem-foto.jpg' },
  { id:1027, lat:-26.8872, lng:-49.0308, nome:'Igreja Luterana Emanuel', setor:'Itoupavazinha', denominacao:'Outra', endereco:'Rua Marcone 180, Itoupavazinha - Blumenau - SC', culto:'', pastor1:'Heldo', esposa1:'', pastor2:'', esposa2:'', telefone:'47 99143-8361', foto:'/fotos/sem-foto.jpg' },
  { id:1028, lat:-26.8993, lng:-49.0654, nome:'Comunidade Cristã Adoremos', setor:'Fortaleza', denominacao:'Outra', endereco:'Rua Júlio Kleine 150, Fortaleza - Blumenau - SC', culto:'', pastor1:'Antônio', esposa1:'', pastor2:'', esposa2:'', telefone:'', foto:'/fotos/sem-foto.jpg' },
  { id:1029, lat:-26.9008, lng:-49.0647, nome:'Igreja Santas Missões', setor:'Fortaleza', denominacao:'Outra', endereco:'Francisco Valdiehk 2106, Fortaleza - Blumenau - SC', culto:'', pastor1:'Anair', esposa1:'', pastor2:'', esposa2:'', telefone:'47 3322-0649', foto:'/fotos/sem-foto.jpg' },
  { id:1030, lat:-26.9027, lng:-49.0647, nome:'Igreja Pentecostal Jesus Cristo é Aliança', setor:'Fortaleza', denominacao:'Outra', endereco:'Rua Babilônia 350, Fortaleza - Blumenau - SC', culto:'', pastor1:'Luzia', esposa1:'', pastor2:'', esposa2:'', telefone:'47 3337-6296', foto:'/fotos/sem-foto.jpg' },
  { id:1031, lat:-26.9157, lng:-49.0710, nome:'Igreja Santuário da Benção', setor:'Fortaleza Alta', denominacao:'Outra', endereco:'Rua das Bromélias 818, Fortaleza Alta - Blumenau - SC', culto:'', pastor1:'Celso', esposa1:'', pastor2:'', esposa2:'', telefone:'47 98427-8723', foto:'/fotos/sem-foto.jpg' },
  { id:1032, lat:-26.9343, lng:-49.0516, nome:'Igreja Pentecostal Missionária', setor:'Garcia', denominacao:'Outra', endereco:'Rua Lions Club 19, Garcia - Blumenau - SC', culto:'', pastor1:'Joceli', esposa1:'', pastor2:'', esposa2:'', telefone:'', foto:'/fotos/sem-foto.jpg' },
  { id:1033, lat:-26.9346, lng:-49.0501, nome:'Igreja do Evangelho Quadrangular', setor:'Garcia', denominacao:'Outra', endereco:'Rua Araranguá 255, Garcia - Blumenau - SC', culto:'', pastor1:'Augustinho', esposa1:'', pastor2:'', esposa2:'', telefone:'47 3329-2956', foto:'/fotos/sem-foto.jpg' },
  { id:1034, lat:-26.9367, lng:-49.0510, nome:'Igreja 1° Batista Pioneira em Blumenau "SHALON"', setor:'Garcia', denominacao:'Outra', endereco:'Rua Pref. Frederico Busch 455, Garcia - Blumenau - SC', culto:'', pastor1:'Edson', esposa1:'', pastor2:'', esposa2:'', telefone:'47 3322-5118', foto:'/fotos/sem-foto.jpg' },
  { id:1035, lat:-26.9387, lng:-49.0514, nome:'Igreja Geração Eleita de Blumenau', setor:'Garcia', denominacao:'Outra', endereco:'Rua Pref. Frederico Busch 538, Garcia - Blumenau - SC', culto:'', pastor1:'Gilmar', esposa1:'', pastor2:'', esposa2:'', telefone:'47 3035-2248', foto:'/fotos/sem-foto.jpg' },
  { id:1036, lat:-26.9385, lng:-49.0539, nome:'Igreja Internacional da Graça', setor:'Garcia', denominacao:'Outra', endereco:'Rua Amazonas 455, Garcia - Blumenau - SC', culto:'', pastor1:'Márcio', esposa1:'', pastor2:'', esposa2:'', telefone:'47 3035-2508', foto:'/fotos/sem-foto.jpg' },
  { id:1037, lat:-26.9351, lng:-49.0543, nome:'Igreja Santas Missões', setor:'Garcia', denominacao:'Outra', endereco:'Rua Amazonas 655, Garcia - Blumenau - SC', culto:'', pastor1:'Nair', esposa1:'', pastor2:'', esposa2:'', telefone:'47 3378-4223', foto:'/fotos/sem-foto.jpg' },
  { id:1038, lat:-26.9374, lng:-49.0520, nome:'Igreja Ministério Tabernáculo da Congregação', setor:'Garcia', denominacao:'Outra', endereco:'Rua Amazonas 3600, Garcia - Blumenau - SC', culto:'', pastor1:'Sonia e Pr. Beto', esposa1:'', pastor2:'', esposa2:'', telefone:'', foto:'/fotos/sem-foto.jpg' },
  { id:1039, lat:-26.9365, lng:-49.0527, nome:'Igreja Visão Missionária', setor:'Garcia', denominacao:'Outra', endereco:'Rua Maravilha 38, Garcia - Blumenau - SC', culto:'', pastor1:'Holdino', esposa1:'', pastor2:'', esposa2:'', telefone:'47 99139-3866', foto:'/fotos/sem-foto.jpg' },
  { id:1040, lat:-26.9377, lng:-49.0533, nome:'Igreja Cristã Maranata', setor:'Garcia', denominacao:'Outra', endereco:'Rua Erico Hoffmann 58, Garcia - Blumenau - SC', culto:'', pastor1:'Janeo', esposa1:'', pastor2:'', esposa2:'', telefone:'47 3234-0274', foto:'/fotos/sem-foto.jpg' },
  { id:1041, lat:-26.9335, lng:-49.0532, nome:'Igreja Evangélica Marca da Promessa', setor:'Garcia', denominacao:'Outra', endereco:'Rua Érico Hoffmann 67, Garcia - Blumenau - SC', culto:'', pastor1:'Wagner', esposa1:'', pastor2:'', esposa2:'', telefone:'47 98405-9160', foto:'/fotos/sem-foto.jpg' },
  { id:1042, lat:-26.9344, lng:-49.0533, nome:'Igreja Internacional Se Tu uma Benção', setor:'Garcia', denominacao:'Outra', endereco:'Rua Espírito Santo 119, Garcia - Blumenau - SC', culto:'', pastor1:'Ap. Alexandre', esposa1:'', pastor2:'', esposa2:'', telefone:'', foto:'/fotos/sem-foto.jpg' },
  { id:1043, lat:-26.9160, lng:-49.0682, nome:'Igreja Adoradores de Jesus', setor:'Glória', denominacao:'Outra', endereco:'Rua da Glória 686, Glória - Blumenau - SC', culto:'', pastor1:'Jocelito', esposa1:'', pastor2:'', esposa2:'', telefone:'47 3329-5638', foto:'/fotos/sem-foto.jpg' },
  { id:1044, lat:-26.9364, lng:-49.0506, nome:'Igreja Pentecostal Nascente Fonte de Amor', setor:'Garcia', denominacao:'Outra', endereco:'Rua da Glória 1390, Garcia - Blumenau - SC', culto:'', pastor1:'Wilson', esposa1:'', pastor2:'', esposa2:'', telefone:'', foto:'/fotos/sem-foto.jpg' },
  { id:1045, lat:-26.9387, lng:-49.0531, nome:'Igreja Evangélica Vida Missionária', setor:'Garcia', denominacao:'Outra', endereco:'Rua da Glória 840, Garcia - Blumenau - SC', culto:'', pastor1:'Jose Roque', esposa1:'', pastor2:'', esposa2:'', telefone:'47 3336-7904', foto:'/fotos/sem-foto.jpg' },
  { id:1046, lat:-26.9376, lng:-49.0544, nome:'Igreja Aliança das Igrejas Ev. Congregacional', setor:'Garcia', denominacao:'Outra', endereco:'Rua Eng. Odebrecht 678, Garcia - Blumenau - SC', culto:'', pastor1:'Jean', esposa1:'', pastor2:'', esposa2:'', telefone:'', foto:'/fotos/sem-foto.jpg' },
  { id:1047, lat:-26.8690, lng:-49.0530, nome:'Igreja Batista da Graça', setor:'Itoupava Central', denominacao:'Outra', endereco:'Rua Gustavo Zimermann 677, Itoupava Central - Blumenau - SC', culto:'', pastor1:'Marcelo', esposa1:'', pastor2:'', esposa2:'', telefone:'47 3338-1542', foto:'/fotos/sem-foto.jpg' },
  { id:1048, lat:-26.8731, lng:-49.0533, nome:'Igreja Pentecostal Jesus de Cristo', setor:'Itoupava Central', denominacao:'Outra', endereco:'Rua Gustavo Zimermann 4354, Itoupava Central - Blumenau - SC', culto:'', pastor1:'', esposa1:'', pastor2:'', esposa2:'', telefone:'', foto:'/fotos/sem-foto.jpg' },
  { id:1049, lat:-26.8747, lng:-49.0563, nome:'Igreja Jesus é Amor', setor:'Itoupava Central', denominacao:'Outra', endereco:'Rua Franz Volles 2055, Itoupava Central - Blumenau - SC', culto:'', pastor1:'Ademir', esposa1:'', pastor2:'', esposa2:'', telefone:'47 99223-6624', foto:'/fotos/sem-foto.jpg' },
  { id:1050, lat:-26.8694, lng:-49.0532, nome:'Igreja Pentecostal Jesus Cristo é Vida', setor:'Itoupava Central', denominacao:'Outra', endereco:'Vila União (ao lado do galpão), Itoupava Central - Blumenau - SC', culto:'', pastor1:'Evandro', esposa1:'', pastor2:'', esposa2:'', telefone:'47 99125-5424', foto:'/fotos/sem-foto.jpg' },
  { id:1051, lat:-26.8705, lng:-49.0549, nome:'Igreja Evangélica Plena Renovação', setor:'Itoupava Central', denominacao:'Outra', endereco:'Rua Ernst Kestner (ao lado da Ass. moradores), Itoupava Central - Blumenau - SC', culto:'', pastor1:'Ilson', esposa1:'', pastor2:'', esposa2:'', telefone:'', foto:'/fotos/sem-foto.jpg' },
  { id:1052, lat:-26.8743, lng:-49.0520, nome:'Ministério Profético Guerreiros de Fogo', setor:'Itoupava Central', denominacao:'Outra', endereco:'Rua Pedro Zimmermann 10140, Itoupava Central - Blumenau - SC', culto:'', pastor1:'Jonas', esposa1:'', pastor2:'', esposa2:'', telefone:'47 3334-5031', foto:'/fotos/sem-foto.jpg' },
  { id:1053, lat:-26.8745, lng:-49.0549, nome:'Igreja Coluna da Vitória', setor:'Itoupava Central', denominacao:'Outra', endereco:'Rua Erich Mayer lote 8, Itoupava Central - Blumenau - SC', culto:'', pastor1:'Sergio', esposa1:'', pastor2:'', esposa2:'', telefone:'47 99227-1028', foto:'/fotos/sem-foto.jpg' },
  { id:1054, lat:-26.8743, lng:-49.0518, nome:'Igreja Pentecostal Jesus Cristo é Amor', setor:'Itoupava Central', denominacao:'Outra', endereco:'Rua prof. Jacob Ineichen 2491, Itoupava Central - Blumenau - SC', culto:'', pastor1:'Ademir', esposa1:'', pastor2:'', esposa2:'', telefone:'47 99219-5697', foto:'/fotos/sem-foto.jpg' },
  { id:1055, lat:-26.8700, lng:-49.0536, nome:'Igreja Internacional da Conquista', setor:'Itoupava Central', denominacao:'Outra', endereco:'Rua prof. Jacob Ineichen 317, Itoupava Central - Blumenau - SC', culto:'', pastor1:'Juliarde', esposa1:'', pastor2:'', esposa2:'', telefone:'47 98412-0942', foto:'/fotos/sem-foto.jpg' },
  { id:1056, lat:-26.8632, lng:-49.0502, nome:'Igreja Evangélica Comunhão Cristã BNU', setor:'Itoupava Norte', denominacao:'Outra', endereco:'Rua Gustavo Lurders 91, Itoupava Norte - Blumenau - SC', culto:'', pastor1:'Roberto/Ramyc', esposa1:'', pastor2:'', esposa2:'', telefone:'47 3323-3939', foto:'/fotos/sem-foto.jpg' },
  { id:1057, lat:-26.8648, lng:-49.0474, nome:'Igreja Cristo é a Esperança', setor:'Itoupava Norte', denominacao:'Outra', endereco:'Rua 02 de Setembro 1243, Itoupava Norte - Blumenau - SC', culto:'', pastor1:'Raul', esposa1:'', pastor2:'', esposa2:'', telefone:'', foto:'/fotos/sem-foto.jpg' },
  { id:1058, lat:-26.8635, lng:-49.0509, nome:'Igreja Mundial do Poder de Deus', setor:'Itoupava Norte', denominacao:'Outra', endereco:'Rua 02 de Setembro 2750, Itoupava Norte - Blumenau - SC', culto:'', pastor1:'Jairo', esposa1:'', pastor2:'', esposa2:'', telefone:'', foto:'/fotos/sem-foto.jpg' },
  { id:1059, lat:-26.8618, lng:-49.0490, nome:'Igreja Evangélica Livre', setor:'Itoupava Norte', denominacao:'Outra', endereco:'Rua Cidade do Salvador 89, Itoupava Norte - Blumenau - SC', culto:'', pastor1:'Werner', esposa1:'', pastor2:'', esposa2:'', telefone:'47 3327-3219', foto:'/fotos/sem-foto.jpg' },
  { id:1060, lat:-26.8643, lng:-49.0489, nome:'Igreja Cristo Vive', setor:'Itoupava Norte', denominacao:'Outra', endereco:'Rua Fritz Spernau 1000, Itoupava Norte - Blumenau - SC', culto:'', pastor1:'Luiz', esposa1:'', pastor2:'', esposa2:'', telefone:'47 3322-2468', foto:'/fotos/sem-foto.jpg' },
  { id:1061, lat:-26.8638, lng:-49.0451, nome:'Igreja ABA', setor:'Itoupava Norte', denominacao:'Outra', endereco:'Rua 25 de Julho 133, Itoupava Norte - Blumenau - SC', culto:'', pastor1:'Haroldo', esposa1:'', pastor2:'', esposa2:'', telefone:'47 3338-3999', foto:'/fotos/sem-foto.jpg' },
  { id:1062, lat:-26.8635, lng:-49.0507, nome:'Igreja Comunidade Cristã Livres em Cristo', setor:'Itoupava Norte', denominacao:'Outra', endereco:'Rua Victório Furlan 101, Itoupava Norte - Blumenau - SC', culto:'', pastor1:'Maurício', esposa1:'', pastor2:'', esposa2:'', telefone:'47 3237-4218', foto:'/fotos/sem-foto.jpg' },
  { id:1063, lat:-26.8596, lng:-49.0503, nome:'Igreja Chamados por Cristo', setor:'Itoupava Norte', denominacao:'Outra', endereco:'Rua Felipe Bauler, Itoupava Norte - Blumenau - SC', culto:'', pastor1:'Oswaldo Cunha', esposa1:'', pastor2:'', esposa2:'', telefone:'47 3339-1543', foto:'/fotos/sem-foto.jpg' },
  { id:1064, lat:-26.8997, lng:-49.0648, nome:'Igreja Comunidade Resgate', setor:'Fortaleza', denominacao:'Outra', endereco:'Rua Fernando Souza e Silva 1187, Fortaleza - Blumenau - SC', culto:'', pastor1:'Alirio', esposa1:'', pastor2:'', esposa2:'', telefone:'47 99266-1652', foto:'/fotos/sem-foto.jpg' },
  { id:1065, lat:-26.8649, lng:-49.0454, nome:'Igreja Evangélica P. Brasil para Cristo', setor:'Itoupava Norte', denominacao:'Outra', endereco:'Rua Avenida Lisboa 651, Itoupava Norte - Blumenau - SC', culto:'', pastor1:'Elias', esposa1:'', pastor2:'', esposa2:'', telefone:'47 99157-0304', foto:'/fotos/sem-foto.jpg' },
  { id:1066, lat:-26.8625, lng:-49.0498, nome:'Igreja Missionária do Brasil', setor:'Itoupava Norte', denominacao:'Outra', endereco:'Rua 1° de Janeiro 559, Itoupava Norte - Blumenau - SC', culto:'', pastor1:'Luiz', esposa1:'', pastor2:'', esposa2:'', telefone:'47 3338-2036', foto:'/fotos/sem-foto.jpg' },
  { id:1067, lat:-26.8473, lng:-49.0587, nome:'Igreja Batista Itoupava Norte', setor:'Itoupava Seca', denominacao:'Outra', endereco:'Rua Santa Catarina 157, Itoupava Seca - Blumenau - SC', culto:'', pastor1:'Saimon', esposa1:'', pastor2:'', esposa2:'', telefone:'47 4102-0754', foto:'/fotos/sem-foto.jpg' },
  { id:1068, lat:-26.8509, lng:-49.0625, nome:'Igreja Batista Restauração', setor:'Itoupava Seca', denominacao:'Outra', endereco:'Rua Almirante Barroso 301, Itoupava Seca - Blumenau - SC', culto:'', pastor1:'Geraldo', esposa1:'', pastor2:'', esposa2:'', telefone:'47 99995-2548', foto:'/fotos/sem-foto.jpg' },
  { id:1069, lat:-26.9208, lng:-49.0675, nome:'Igreja Apostólica Renascer em Cristo', setor:'Victor Konder', denominacao:'Outra', endereco:'Rua Martin Luther 545, Victor Konder - Blumenau - SC', culto:'', pastor1:'Marlon', esposa1:'', pastor2:'', esposa2:'', telefone:'47 99970-1143', foto:'/fotos/sem-foto.jpg' },
  { id:1070, lat:-26.8481, lng:-49.0600, nome:'Igreja Koinonia', setor:'Itoupava Seca', denominacao:'Outra', endereco:'Rua Alfredo Hering 98, Itoupava Seca - Blumenau - SC', culto:'', pastor1:'Leonardo', esposa1:'', pastor2:'', esposa2:'', telefone:'47 3327-7502', foto:'/fotos/sem-foto.jpg' },
  { id:1071, lat:-26.8511, lng:-49.0630, nome:'Igreja de Jesus', setor:'Itoupava Seca', denominacao:'Outra', endereco:'Rua Alfredo Hering 145, Itoupava Seca - Blumenau - SC', culto:'', pastor1:'Natalino', esposa1:'', pastor2:'', esposa2:'', telefone:'47 3323-1274', foto:'/fotos/sem-foto.jpg' },
  { id:1072, lat:-26.8859, lng:-49.0327, nome:'Igreja Santas Missões', setor:'Itoupavazinha', denominacao:'Outra', endereco:'Rua Johann Sasche 2685, Itoupavazinha - Blumenau - SC', culto:'', pastor1:'Tiago', esposa1:'', pastor2:'', esposa2:'', telefone:'47 99210-1169', foto:'/fotos/sem-foto.jpg' },
  { id:1073, lat:-26.8882, lng:-49.0290, nome:'Igreja Comunhão Ev. Manancial da Videira', setor:'Itoupavazinha', denominacao:'Outra', endereco:'Rua Jardim Germânico 702, Itoupavazinha - Blumenau - SC', culto:'', pastor1:'Sidnei', esposa1:'', pastor2:'', esposa2:'', telefone:'', foto:'/fotos/sem-foto.jpg' },
  { id:1074, lat:-26.8887, lng:-49.0348, nome:'Igreja Comunidade Evangélica da Paz', setor:'Itoupavazinha', denominacao:'Outra', endereco:'Rua Frederico Jesen 985, Itoupavazinha - Blumenau - SC', culto:'', pastor1:'José', esposa1:'', pastor2:'', esposa2:'', telefone:'', foto:'/fotos/sem-foto.jpg' },
  { id:1075, lat:-26.8868, lng:-49.0337, nome:'Igreja Evangélica Pentecostal Fonte de Água Viva', setor:'Itoupavazinha', denominacao:'Outra', endereco:'Rua Francisco Marcelino Dias 08, Itoupavazinha - Blumenau - SC', culto:'', pastor1:'Paulo', esposa1:'', pastor2:'', esposa2:'', telefone:'47 99144-6321', foto:'/fotos/sem-foto.jpg' },
  { id:1076, lat:-26.8902, lng:-49.0323, nome:'Igreja Evangélica Colheita Final', setor:'Itoupavazinha', denominacao:'Outra', endereco:'Rua Frederico Bohringer 316 lote Libertadores, Itoupavazinha - Blumenau - SC', culto:'', pastor1:'Joel', esposa1:'', pastor2:'', esposa2:'', telefone:'', foto:'/fotos/sem-foto.jpg' },
  { id:1077, lat:-26.8876, lng:-49.0321, nome:'Igreja Cristo é a Esperança', setor:'Itoupavazinha', denominacao:'Outra', endereco:'Loteamento da América do Sol 46, Itoupavazinha - Blumenau - SC', culto:'', pastor1:'Laudelino', esposa1:'', pastor2:'', esposa2:'', telefone:'47 99139-2650', foto:'/fotos/sem-foto.jpg' },
  { id:1078, lat:-26.8860, lng:-49.0302, nome:'Igreja Deus é Amor', setor:'Itoupavazinha', denominacao:'Outra', endereco:'Rua Frederico Jensen 3010, Itoupavazinha - Blumenau - SC', culto:'', pastor1:'Isabel', esposa1:'', pastor2:'', esposa2:'', telefone:'47 99171-0205', foto:'/fotos/sem-foto.jpg' },
  { id:1079, lat:-26.8502, lng:-49.0612, nome:'Igreja Metodista', setor:'Itoupava Seca', denominacao:'Outra', endereco:'Rua São Paulo 2896, Itoupava Seca - Blumenau - SC', culto:'', pastor1:'Devalter', esposa1:'', pastor2:'', esposa2:'', telefone:'47 99602-2877', foto:'/fotos/sem-foto.jpg' },
  { id:1080, lat:-26.9204, lng:-49.0672, nome:'Igreja Visão Missionária Nova Esperança', setor:'Nova Esperança', denominacao:'Outra', endereco:'Rua Henrique Reif 1533, Nova Esperança - Blumenau - SC', culto:'', pastor1:'Flávio', esposa1:'', pastor2:'', esposa2:'', telefone:'', foto:'/fotos/sem-foto.jpg' },
  { id:1081, lat:-26.9127, lng:-49.0911, nome:'Igreja Assembléia de Deus Renovada do Caminho', setor:'Passo Manso', denominacao:'Outra', endereco:'Rua Artur Mantal 7011, Passo Manso - Blumenau - SC', culto:'', pastor1:'Manoel', esposa1:'', pastor2:'', esposa2:'', telefone:'47 3330-4622', foto:'/fotos/sem-foto.jpg' },
  { id:1082, lat:-26.9411, lng:-49.0606, nome:'Igreja Visão Missionária Rep. Argentina', setor:'Ponta Aguda', denominacao:'Outra', endereco:'Rua José Isidoro Correa 871, Ponta Aguda - Blumenau - SC', culto:'', pastor1:'Antônio', esposa1:'', pastor2:'', esposa2:'', telefone:'', foto:'/fotos/sem-foto.jpg' },
  { id:1083, lat:-26.9411, lng:-49.0609, nome:'Igreja Deus é Amor', setor:'Ponta Aguda', denominacao:'Outra', endereco:'Rua José Isidoro Correa 436, Ponta Aguda - Blumenau - SC', culto:'', pastor1:'Claudinei', esposa1:'', pastor2:'', esposa2:'', telefone:'47 99155-7253', foto:'/fotos/sem-foto.jpg' },
  { id:1084, lat:-26.9395, lng:-49.0599, nome:'Igreja Jesus é a Verdade', setor:'Ponta Aguda', denominacao:'Outra', endereco:'Rua das Missões 2192, Ponta Aguda - Blumenau - SC', culto:'', pastor1:'Alexsandro', esposa1:'', pastor2:'', esposa2:'', telefone:'47 3237-2679', foto:'/fotos/sem-foto.jpg' },
  { id:1085, lat:-26.9438, lng:-49.0598, nome:'Igreja Batista Nacional Luz Para as Nações', setor:'Ponta Aguda', denominacao:'Outra', endereco:'Rua das Missões 1426, Ponta Aguda - Blumenau - SC', culto:'', pastor1:'Osmar', esposa1:'', pastor2:'', esposa2:'', telefone:'47 3322-7241', foto:'/fotos/sem-foto.jpg' },
  { id:1086, lat:-26.9698, lng:-49.0450, nome:'Igreja Quadrangular', setor:'Progresso', denominacao:'Outra', endereco:'Rua Júlio Heiden 1315, Progresso - Blumenau - SC', culto:'', pastor1:'Manoel', esposa1:'', pastor2:'', esposa2:'', telefone:'47 99244-9575', foto:'/fotos/sem-foto.jpg' },
  { id:1087, lat:-26.9711, lng:-49.0452, nome:'Igreja Deus é Amor', setor:'Progresso', denominacao:'Outra', endereco:'Rua Ruy Barbosa 771, Progresso - Blumenau - SC', culto:'', pastor1:'Cristóvão', esposa1:'', pastor2:'', esposa2:'', telefone:'47 3336-7959', foto:'/fotos/sem-foto.jpg' },
  { id:1088, lat:-26.9703, lng:-49.0456, nome:'Igreja Pentecostal Jerusalém Missão de Deus', setor:'Progresso', denominacao:'Outra', endereco:'Rua Ruy Barbosa 36, Progresso - Blumenau - SC', culto:'', pastor1:'José', esposa1:'', pastor2:'', esposa2:'', telefone:'47 98887-1791', foto:'/fotos/sem-foto.jpg' },
  { id:1089, lat:-26.9708, lng:-49.0430, nome:'Igreja Pentecostal Pedras Vivas', setor:'Progresso', denominacao:'Outra', endereco:'Rua Ruy Barbosa 3224, Progresso - Blumenau - SC', culto:'', pastor1:'Enivaldo', esposa1:'', pastor2:'', esposa2:'', telefone:'47 98814-7707', foto:'/fotos/sem-foto.jpg' },
  { id:1090, lat:-26.9694, lng:-49.0450, nome:'Igreja Aliança Eterna com Deus', setor:'Progresso', denominacao:'Outra', endereco:'Rua Bruno Schraiber 2367, Progresso - Blumenau - SC', culto:'', pastor1:'Amilton', esposa1:'', pastor2:'', esposa2:'', telefone:'47 3326-0119', foto:'/fotos/sem-foto.jpg' },
  { id:1091, lat:-26.9710, lng:-49.0444, nome:'Igreja Cristo é a Esperança', setor:'Progresso', denominacao:'Outra', endereco:'Rua Santa Maria 2701, Progresso - Blumenau - SC', culto:'', pastor1:'Danilo', esposa1:'', pastor2:'', esposa2:'', telefone:'', foto:'/fotos/sem-foto.jpg' },
  { id:1092, lat:-26.9697, lng:-49.0441, nome:'Igreja Visão Missionária', setor:'Progresso', denominacao:'Outra', endereco:'Rua Progresso 1607, Progresso - Blumenau - SC', culto:'', pastor1:'Alonsio', esposa1:'', pastor2:'', esposa2:'', telefone:'47 98464-0020', foto:'/fotos/sem-foto.jpg' },
  { id:1093, lat:-26.9202, lng:-49.0710, nome:'Igreja Evangélica Restauração Cristã', setor:'Salto Do Norte', denominacao:'Outra', endereco:'Rua Engenheiro Udo Deeke 2559, Salto Do Norte - Blumenau - SC', culto:'', pastor1:'Invandel', esposa1:'', pastor2:'', esposa2:'', telefone:'47 99248-3560', foto:'/fotos/sem-foto.jpg' },
  { id:1094, lat:-26.9177, lng:-49.0668, nome:'Ministério Amor Incondicionado MAI', setor:'Salto Do Norte', denominacao:'Outra', endereco:'Rua Bahia 56, Salto Do Norte - Blumenau - SC', culto:'', pastor1:'Freddy', esposa1:'', pastor2:'', esposa2:'', telefone:'', foto:'/fotos/sem-foto.jpg' },
  { id:1095, lat:-26.9183, lng:-49.0722, nome:'Santuário da Família BNU', setor:'Salto Do Norte', denominacao:'Outra', endereco:'Rua Marechal Rondon, 740, Salto Do Norte - Blumenau - SC', culto:'', pastor1:'BP. Osmar', esposa1:'', pastor2:'', esposa2:'', telefone:'47 3337-1479', foto:'/fotos/sem-foto.jpg' },
  { id:1096, lat:-26.9199, lng:-49.0568, nome:'Igreja Mevan', setor:'Vila Nova', denominacao:'Outra', endereco:'Rua Emiliano J. de Oliveira 70, Vila Nova - Blumenau - SC', culto:'', pastor1:'André / Chico', esposa1:'', pastor2:'', esposa2:'', telefone:'47 99145-3463', foto:'/fotos/sem-foto.jpg' },
  { id:1097, lat:-26.9191, lng:-49.0708, nome:'Igreja Evangélica Assembléia dos Santos', setor:'Salto Do Norte', denominacao:'Outra', endereco:'Johann Sasche 2900, Salto Do Norte - Blumenau - SC', culto:'', pastor1:'Alexandre', esposa1:'', pastor2:'', esposa2:'', telefone:'47 3234-0115', foto:'/fotos/sem-foto.jpg' },
  { id:1098, lat:-26.9156, lng:-49.0681, nome:'Igreja Pentecostal Visão Cristã', setor:'Salto Do Norte', denominacao:'Outra', endereco:'Rua Udo Deeke 884, Salto Do Norte - Blumenau - SC', culto:'', pastor1:'Antônio', esposa1:'', pastor2:'', esposa2:'', telefone:'47 3334-3661', foto:'/fotos/sem-foto.jpg' },
  { id:1099, lat:-26.9194, lng:-49.0663, nome:'Igreja Templos dos Milagres', setor:'Salto Do Norte', denominacao:'Outra', endereco:'Rua Udo Deeke 2040, Salto Do Norte - Blumenau - SC', culto:'', pastor1:'Marcio', esposa1:'', pastor2:'', esposa2:'', telefone:'47 99144-6742', foto:'/fotos/sem-foto.jpg' },
  { id:1100, lat:-26.8886, lng:-49.1402, nome:'Igreja Deus é Amor', setor:'Salto Weissbach', denominacao:'Outra', endereco:'Rua Bahia 4000, Salto Weissbach - Blumenau - SC', culto:'', pastor1:'Antenor', esposa1:'', pastor2:'', esposa2:'', telefone:'47 3325-3074', foto:'/fotos/sem-foto.jpg' },
  { id:1101, lat:-26.9191, lng:-49.0695, nome:'Igreja Deus é Amor', setor:'Tribess', denominacao:'Outra', endereco:'Rua Hermann Tribess 264, Tribess - Blumenau - SC', culto:'', pastor1:'', esposa1:'', pastor2:'', esposa2:'', telefone:'', foto:'/fotos/sem-foto.jpg' },
  { id:1102, lat:-26.9715, lng:-49.0423, nome:'Igreja Pentecostal Deus é um Só', setor:'Progresso', denominacao:'Outra', endereco:'Rua Bruna Schreiber, Progresso - Blumenau - SC', culto:'', pastor1:'Dorival', esposa1:'', pastor2:'', esposa2:'', telefone:'47 99982-7183', foto:'/fotos/sem-foto.jpg' },
  { id:1103, lat:-26.9254, lng:-49.0490, nome:'Igreja Batista Independente', setor:'Velha', denominacao:'Outra', endereco:'Rua Bagé 205, Velha - Blumenau - SC', culto:'', pastor1:'Olandino', esposa1:'', pastor2:'', esposa2:'', telefone:'47 99662-1133', foto:'/fotos/sem-foto.jpg' },
  { id:1104, lat:-26.9273, lng:-49.0475, nome:'Igreja Presbiteriana Filadélfia de Blumenau', setor:'Velha', denominacao:'Outra', endereco:'Rua dos Caçadores 3165, Velha - Blumenau - SC', culto:'', pastor1:'Marcio', esposa1:'', pastor2:'', esposa2:'', telefone:'47 3232-1132', foto:'/fotos/sem-foto.jpg' },
  { id:1105, lat:-26.9260, lng:-49.0448, nome:'Igreja Evangélica Irmãos Menonita', setor:'Velha', denominacao:'Outra', endereco:'Rua Itapiranga 249, Velha - Blumenau - SC', culto:'', pastor1:'Arnoldo', esposa1:'', pastor2:'', esposa2:'', telefone:'', foto:'/fotos/sem-foto.jpg' },
  { id:1106, lat:-26.9285, lng:-49.0457, nome:'Igreja Quadrangular', setor:'Velha', denominacao:'Outra', endereco:'Rua João Pessoa 2479, Velha - Blumenau - SC', culto:'', pastor1:'Vilmar', esposa1:'', pastor2:'', esposa2:'', telefone:'47 98465-9069', foto:'/fotos/sem-foto.jpg' },
  { id:1107, lat:-26.9277, lng:-49.0437, nome:'Igreja Deus é Amor', setor:'Velha', denominacao:'Outra', endereco:'Rua das Comunidades 239, Velha - Blumenau - SC', culto:'', pastor1:'Isidoro', esposa1:'', pastor2:'', esposa2:'', telefone:'47 3330-3404', foto:'/fotos/sem-foto.jpg' },
  { id:1108, lat:-26.9186, lng:-49.0685, nome:'Igreja Evangelho Quadrangular', setor:'Velha Central', denominacao:'Outra', endereco:'Rua José Reuter 18, Velha Central - Blumenau - SC', culto:'', pastor1:'Orides', esposa1:'', pastor2:'', esposa2:'', telefone:'', foto:'/fotos/sem-foto.jpg' },
  { id:1109, lat:-26.9202, lng:-49.0702, nome:'Comunidade Cristã do Monte', setor:'Velha Central', denominacao:'Outra', endereco:'Rua Germano Jahn 150, Velha Central - Blumenau - SC', culto:'', pastor1:'Ademar', esposa1:'', pastor2:'', esposa2:'', telefone:'47 3328-3362', foto:'/fotos/sem-foto.jpg' },
  { id:1110, lat:-26.9198, lng:-49.0708, nome:'Igreja Visão Missionária Ristow', setor:'Velha Central', denominacao:'Outra', endereco:'Rua José Reiter 2263, Velha Central - Blumenau - SC', culto:'', pastor1:'Assis', esposa1:'', pastor2:'', esposa2:'', telefone:'47 99278-7102', foto:'/fotos/sem-foto.jpg' },
  { id:1111, lat:-26.9213, lng:-49.0711, nome:'Igreja Habitação do Senhor', setor:'Velha Central', denominacao:'Outra', endereco:'Rua José Reuter 3356, Velha Central - Blumenau - SC', culto:'', pastor1:'Arison', esposa1:'', pastor2:'', esposa2:'', telefone:'47 99271-1384', foto:'/fotos/sem-foto.jpg' },
  { id:1112, lat:-26.9308, lng:-49.0978, nome:'Igreja Congregação Cristã no Brasil', setor:'Velha Grande', denominacao:'Outra', endereco:'Rua Teresa Marta Mathes 47, Velha Grande - Blumenau - SC', culto:'', pastor1:'Antonio', esposa1:'', pastor2:'', esposa2:'', telefone:'', foto:'/fotos/sem-foto.jpg' },
  { id:1113, lat:-26.9324, lng:-49.1003, nome:'Igreja Labareda de Fogo', setor:'Velha Grande', denominacao:'Outra', endereco:'Rua da Cidade 243, Velha Grande - Blumenau - SC', culto:'', pastor1:'Jorge', esposa1:'', pastor2:'', esposa2:'', telefone:'47 99193-8848', foto:'/fotos/sem-foto.jpg' },
  { id:1114, lat:-26.9162, lng:-49.0574, nome:'Igreja Evangélica Plano de Deus', setor:'Vila Nova', denominacao:'Outra', endereco:'Rua Almirante Barroso 399, Vila Nova - Blumenau - SC', culto:'', pastor1:'Osmar', esposa1:'', pastor2:'', esposa2:'', telefone:'47 3334-3683', foto:'/fotos/sem-foto.jpg' },
  { id:1115, lat:-26.9182, lng:-49.0596, nome:'Igreja Cristã Templo do Milagre', setor:'Vila Nova', denominacao:'Outra', endereco:'Rua Emílio Julio de Oliveira 70, Vila Nova - Blumenau - SC', culto:'', pastor1:'Mario', esposa1:'', pastor2:'', esposa2:'', telefone:'47 3323-8068', foto:'/fotos/sem-foto.jpg' },
  { id:1116, lat:-26.8736, lng:-49.0527, nome:'Igreja Deus é Amor', setor:'Itoupava Central', denominacao:'Outra', endereco:'Rua Gustavo Zimermann 3136, Itoupava Central - Blumenau - SC', culto:'', pastor1:'', esposa1:'', pastor2:'', esposa2:'', telefone:'', foto:'/fotos/sem-foto.jpg' },
  { id:1117, lat:-26.8747, lng:-49.0533, nome:'Igreja Batista', setor:'Itoupava Central', denominacao:'Outra', endereco:'Rua Gustavo Zimermann 6930, Itoupava Central - Blumenau - SC', culto:'', pastor1:'Tomas', esposa1:'', pastor2:'', esposa2:'', telefone:'47 99614-3057', foto:'/fotos/sem-foto.jpg' },
  { id:1118, lat:-26.9694, lng:-49.0473, nome:'Igreja Pentecostal Virtude do Senhor', setor:'Progresso', denominacao:'Outra', endereco:'Cristiane Maria Texeira, 71, Progresso - Blumenau - SC', culto:'', pastor1:'Neuza', esposa1:'', pastor2:'', esposa2:'', telefone:'47 99213-0638', foto:'/fotos/sem-foto.jpg' },
  { id:1119, lat:-26.9178, lng:-49.0708, nome:'Igreja Visão Missionária', setor:'Glória', denominacao:'Outra', endereco:'Rua Glória, Glória - Blumenau - SC', culto:'', pastor1:'Volnir', esposa1:'', pastor2:'', esposa2:'', telefone:'', foto:'/fotos/sem-foto.jpg' },
  { id:1120, lat:-26.9187, lng:-49.0687, nome:'Igreja Semear', setor:'Centro', denominacao:'Outra', endereco:'Rua Pedro Krauss, Centro - Blumenau - SC', culto:'', pastor1:'Jean', esposa1:'', pastor2:'', esposa2:'', telefone:'', foto:'/fotos/sem-foto.jpg' },
  { id:1121, lat:-26.9433, lng:-49.0616, nome:'Igreja Presbiteriana', setor:'Ponta Aguda', denominacao:'Outra', endereco:'R. República Argentina, 431, Ponta Aguda - Blumenau - SC', culto:'', pastor1:'Pr. Anderson', esposa1:'', pastor2:'', esposa2:'', telefone:'47 3035-4270', foto:'/fotos/sem-foto.jpg' },
  { id:1122, lat:-26.8695, lng:-49.0549, nome:'Igreja Templo de Deus', setor:'Itoupava Central', denominacao:'Outra', endereco:'Rua Alfredo José Gonçalves, Itoupava Central - Blumenau - SC', culto:'', pastor1:'', esposa1:'', pastor2:'', esposa2:'', telefone:'47 99222-9133', foto:'/fotos/sem-foto.jpg' },
  { id:1123, lat:-26.9206, lng:-49.0702, nome:'Igreja Palavra Profética', setor:'Velha Central', denominacao:'Outra', endereco:'Rua José Reuter 2302, Velha Central - Blumenau - SC', culto:'', pastor1:'', esposa1:'', pastor2:'', esposa2:'', telefone:'', foto:'/fotos/sem-foto.jpg' },
  { id:1124, lat:-26.9324, lng:-49.0991, nome:'Igreja Habitação do Senhor', setor:'Velha Grande', denominacao:'Outra', endereco:'Rua Franz Muller 40, Velha Grande - Blumenau - SC', culto:'', pastor1:'', esposa1:'', pastor2:'', esposa2:'', telefone:'', foto:'/fotos/sem-foto.jpg' },
  { id:1125, lat:-26.9310, lng:-49.0990, nome:'Igreja Missionária', setor:'Velha Grande', denominacao:'Outra', endereco:'Rua Franz Muller 2520, Velha Grande - Blumenau - SC', culto:'', pastor1:'', esposa1:'', pastor2:'', esposa2:'', telefone:'', foto:'/fotos/sem-foto.jpg' },
  { id:1126, lat:-26.8904, lng:-49.0342, nome:'Igreja Quadrangular', setor:'Itoupavazinha', denominacao:'Outra', endereco:'Rua Frederico Jesen 2711, Itoupavazinha - Blumenau - SC', culto:'', pastor1:'Joice', esposa1:'', pastor2:'', esposa2:'', telefone:'', foto:'/fotos/sem-foto.jpg' },
  { id:1127, lat:-26.8855, lng:-49.0321, nome:'Igreja Colheita Final', setor:'Itoupavazinha', denominacao:'Outra', endereco:'Rua Herbert André Lubow 175, Itoupavazinha - Blumenau - SC', culto:'', pastor1:'Diego', esposa1:'', pastor2:'', esposa2:'', telefone:'', foto:'/fotos/sem-foto.jpg' },
  { id:1128, lat:-26.9182, lng:-49.0679, nome:'Igreja Internacional da Conquista', setor:'Valparaíso', denominacao:'Outra', endereco:'Rua Antônio Zendron 52, Valparaíso - Blumenau - SC', culto:'', pastor1:'', esposa1:'', pastor2:'', esposa2:'', telefone:'', foto:'/fotos/sem-foto.jpg' },
  { id:1129, lat:-26.9673, lng:-49.0424, nome:'Igreja Discípulo de Cristo', setor:'Progresso', denominacao:'Outra', endereco:'Rua Helmuth, Progresso - Blumenau - SC', culto:'', pastor1:'', esposa1:'', pastor2:'', esposa2:'', telefone:'47 99723-3137', foto:'/fotos/sem-foto.jpg' },
  { id:1130, lat:-26.9018, lng:-49.0625, nome:'Igreja Quadrangular', setor:'Fortaleza', denominacao:'Outra', endereco:'Rua Quadrangular 78, Fortaleza - Blumenau - SC', culto:'', pastor1:'', esposa1:'', pastor2:'', esposa2:'', telefone:'', foto:'/fotos/sem-foto.jpg' },
  { id:1131, lat:-26.8626, lng:-49.0494, nome:'Igreja Casa do Oleiro', setor:'Itoupava Norte', denominacao:'Outra', endereco:'Rua 25 de Julho 1194, Itoupava Norte - Blumenau - SC', culto:'', pastor1:'', esposa1:'', pastor2:'', esposa2:'', telefone:'', foto:'/fotos/sem-foto.jpg' },
  { id:1132, lat:-26.8848, lng:-49.0316, nome:'Igreja Vinha Church', setor:'Itoupavazinha', denominacao:'Outra', endereco:'R. Frederico Jensen, 2818, Itoupavazinha - Blumenau - SC', culto:'', pastor1:'', esposa1:'', pastor2:'', esposa2:'', telefone:'', foto:'/fotos/sem-foto.jpg' },
  { id:1133, lat:-26.8892, lng:-49.1203, nome:'Igreja Casa de Oração Cristo é o Caminho', setor:'Badenfurt', denominacao:'Outra', endereco:'Rua Johann Sasche 585, Badenfurt - Blumenau - SC', culto:'', pastor1:'', esposa1:'', pastor2:'', esposa2:'', telefone:'', foto:'/fotos/sem-foto.jpg' },
  { id:1134, lat:-26.8923, lng:-49.1195, nome:'Igreja IPAS', setor:'Badenfurt', denominacao:'Outra', endereco:'Rua Johann Sasche 2900, Badenfurt - Blumenau - SC', culto:'', pastor1:'', esposa1:'', pastor2:'', esposa2:'', telefone:'47 99112-2677', foto:'/fotos/sem-foto.jpg' },
  { id:1135, lat:-26.8506, lng:-49.1367, nome:'Igreja Imersão', setor:'Salto', denominacao:'Outra', endereco:'Rua Bahia 1548, Salto - Blumenau - SC', culto:'', pastor1:'Pr. Marcelo Eschberger', esposa1:'', pastor2:'', esposa2:'', telefone:'', foto:'/fotos/sem-foto.jpg' },
  { id:1136, lat:-26.9375, lng:-49.0521, nome:'Igreja da Graça de Deus', setor:'Garcia', denominacao:'Outra', endereco:'Rua Amazonas 455, Garcia - Blumenau - SC', culto:'', pastor1:'Pr. Sodré', esposa1:'', pastor2:'', esposa2:'', telefone:'47 99697-2583', foto:'/fotos/sem-foto.jpg' },
  { id:1137, lat:-26.9338, lng:-49.0525, nome:'Igreja Visão Missionária', setor:'Garcia', denominacao:'Outra', endereco:'Rua Amazonas 119, Garcia - Blumenau - SC', culto:'', pastor1:'', esposa1:'', pastor2:'', esposa2:'', telefone:'47 3322-0587', foto:'/fotos/sem-foto.jpg' },
  { id:1138, lat:-26.8474, lng:-49.1337, nome:'Igreja Poiema', setor:'Salto', denominacao:'Outra', endereco:'Rua Bahia 1754, Salto - Blumenau - SC', culto:'', pastor1:'Pr. Chris', esposa1:'', pastor2:'', esposa2:'', telefone:'47 99184-1595', foto:'/fotos/sem-foto.jpg' },
  { id:1139, lat:-26.9026, lng:-49.0673, nome:'Impac - Ministério Pertencer a Cristo', setor:'Fortaleza', denominacao:'Outra', endereco:'Rua Fritz Koegler 1495, Fortaleza - Blumenau - SC', culto:'', pastor1:'Pr. José Rafael', esposa1:'', pastor2:'', esposa2:'', telefone:'47 99191-6271', foto:'/fotos/sem-foto.jpg' },
  { id:1140, lat:-26.9126, lng:-49.0369, nome:'Igreja Assembleia de Deus Madureira', setor:'Fidélis', denominacao:'Outra', endereco:'Rua Wilhelm Alsleben 645, Fidélis - Blumenau - SC', culto:'', pastor1:'Pr. Felipe', esposa1:'', pastor2:'', esposa2:'', telefone:'47 99933-8358', foto:'/fotos/sem-foto.jpg' },
  { id:1141, lat:-26.8710, lng:-49.0515, nome:'Igreja Batista da Graça', setor:'Itoupava Central', denominacao:'Outra', endereco:'Rua Gustavo Zimmermann 677, Itoupava Central - Blumenau - SC', culto:'', pastor1:'', esposa1:'', pastor2:'', esposa2:'', telefone:'47 98837-7902', foto:'/fotos/sem-foto.jpg' },
  { id:1142, lat:-26.8719, lng:-49.0541, nome:'Igreja Pentecostal do Soberano Refúgio dos Profetas', setor:'Itoupava Central', denominacao:'Outra', endereco:'Rua Gustavo Zimmermann 3136, Itoupava Central - Blumenau - SC', culto:'', pastor1:'Braydner Alves de Souza', esposa1:'', pastor2:'', esposa2:'', telefone:'47 99620-1928', foto:'/fotos/sem-foto.jpg' },
  { id:1143, lat:-26.9380, lng:-49.0536, nome:'Igreja Sanpaz', setor:'Garcia', denominacao:'Outra', endereco:'Rua Amazonas 4155, Garcia - Blumenau - SC', culto:'', pastor1:'Pr. Cairo', esposa1:'', pastor2:'', esposa2:'', telefone:'47 98496-6356', foto:'/fotos/sem-foto.jpg' },
  { id:1144, lat:-26.9172, lng:-49.0681, nome:'Igreja Sanpaz', setor:'Valparaíso', denominacao:'Outra', endereco:'Rua Hermann Huscher 2780, Valparaíso - Blumenau - SC', culto:'', pastor1:'', esposa1:'', pastor2:'', esposa2:'', telefone:'47 98496-6356', foto:'/fotos/sem-foto.jpg' },
  { id:1145, lat:-26.9162, lng:-49.0695, nome:'Igreja de Deus Pentecostal Unidos Venceremos', setor:'Glória', denominacao:'Outra', endereco:'Rua Belo Horizonte 804, Glória - Blumenau - SC', culto:'', pastor1:'Pr. Marcos Antônio', esposa1:'', pastor2:'', esposa2:'', telefone:'', foto:'/fotos/sem-foto.jpg' },
  { id:1146, lat:-26.9366, lng:-49.0513, nome:'Ministério Reino Eterno', setor:'Garcia', denominacao:'Outra', endereco:'Rua Araranguá 635, Garcia - Blumenau - SC', culto:'', pastor1:'Pr. Edson e Adriana', esposa1:'', pastor2:'', esposa2:'', telefone:'47 99251-1896', foto:'/fotos/sem-foto.jpg' },
  { id:1147, lat:-26.9696, lng:-49.0435, nome:'Igreja Pentecostal Deus é um Só', setor:'Progresso', denominacao:'Outra', endereco:'Rua Bruno Schraiber 2045, Progresso - Blumenau - SC', culto:'', pastor1:'Luiz Gracioli', esposa1:'', pastor2:'', esposa2:'', telefone:'47 98456-4343', foto:'/fotos/sem-foto.jpg' },
  { id:1148, lat:-26.8742, lng:-49.0538, nome:'Igreja Madma', setor:'Itoupava Central', denominacao:'Outra', endereco:'Rua Prof. Jacob Ineichen 317, Itoupava Central - Blumenau - SC', culto:'', pastor1:'Pr. Luciano', esposa1:'', pastor2:'', esposa2:'', telefone:'47 99144-4537', foto:'/fotos/sem-foto.jpg' },
  { id:1149, lat:-26.8900, lng:-49.0307, nome:'Igreja Metodista', setor:'Itoupavazinha', denominacao:'Outra', endereco:'Rua Frederico Jensen 797, Itoupavazinha - Blumenau - SC', culto:'', pastor1:'', esposa1:'', pastor2:'', esposa2:'', telefone:'47 99602-2877', foto:'/fotos/sem-foto.jpg' },
  { id:1150, lat:-26.9266, lng:-49.0458, nome:'Igreja Batista Missionária', setor:'Velha', denominacao:'Outra', endereco:'Rua Governador Jorge Lacerda 1165, Velha - Blumenau - SC', culto:'', pastor1:'Jorge Proença / Cristina', esposa1:'', pastor2:'', esposa2:'', telefone:'47 99216-2151', foto:'/fotos/sem-foto.jpg' },
  { id:1151, lat:-26.9296, lng:-49.0453, nome:'Ministério Reino Eterno', setor:'Velha', denominacao:'Outra', endereco:'Rua José Reuter 800, Velha - Blumenau - SC', culto:'', pastor1:'Pr. Ronaldo Teixeira', esposa1:'', pastor2:'', esposa2:'', telefone:'47 3327-4655', foto:'/fotos/sem-foto.jpg' },
  { id:1152, lat:-26.9242, lng:-49.0463, nome:'Igreja Pentecostal o Único Caminho é Jesus', setor:'Velha', denominacao:'Outra', endereco:'Rua José Reuter 1409, Velha - Blumenau - SC', culto:'', pastor1:'', esposa1:'', pastor2:'', esposa2:'', telefone:'', foto:'/fotos/sem-foto.jpg' },
  { id:1153, lat:-26.8914, lng:-49.1168, nome:'Igreja Reconciliados com Cristo', setor:'Badenfurt', denominacao:'Outra', endereco:'Rua Heinrich Hemmer 51, Badenfurt - Blumenau - SC', culto:'', pastor1:'Pr. Prozias Silva', esposa1:'', pastor2:'', esposa2:'', telefone:'47 98911-4552', foto:'/fotos/sem-foto.jpg' },
  { id:1154, lat:-26.9179, lng:-49.0700, nome:'Igreja Evangélica Palavra Profética', setor:'Velha Central', denominacao:'Outra', endereco:'Rua José Reuter 2302, Velha Central - Blumenau - SC', culto:'', pastor1:'Pr. Elias', esposa1:'', pastor2:'', esposa2:'', telefone:'47 99656-6028', foto:'/fotos/sem-foto.jpg' },
  { id:1155, lat:-26.9181, lng:-49.0700, nome:'Igreja Batista Imperial', setor:'Velha Central', denominacao:'Outra', endereco:'Rua Alcida da Silva Teles 40, Velha Central - Blumenau - SC', culto:'', pastor1:'Pr. Juliano e Thais', esposa1:'', pastor2:'', esposa2:'', telefone:'47 98804-7715', foto:'/fotos/sem-foto.jpg' },
  { id:1156, lat:-26.9170, lng:-49.0719, nome:'Igreja Videira', setor:'Salto Do Norte', denominacao:'Outra', endereco:'Rua Pomerode 2170, Salto Do Norte - Blumenau - SC', culto:'', pastor1:'Pr. Marcelo Marcondes', esposa1:'', pastor2:'', esposa2:'', telefone:'47 99292-2150', foto:'/fotos/sem-foto.jpg' },
  { id:1157, lat:-26.9204, lng:-49.0684, nome:'Igreja Casa de Oração', setor:'Centro', denominacao:'Outra', endereco:'Rua XV de Novembro 117, Centro - Blumenau - SC', culto:'', pastor1:'Pr. Lorentino', esposa1:'', pastor2:'', esposa2:'', telefone:'47 98403-3040', foto:'/fotos/sem-foto.jpg' },
  { id:1158, lat:-26.8623, lng:-49.0497, nome:'Igreja Calvário Amor e Vida', setor:'Itoupava Norte', denominacao:'Outra', endereco:'Rua Guaracicaba 59, Itoupava Norte - Blumenau - SC', culto:'', pastor1:'', esposa1:'', pastor2:'', esposa2:'', telefone:'47 99165-2732', foto:'/fotos/sem-foto.jpg' },
  { id:1159, lat:-26.9334, lng:-49.0521, nome:'Igreja MFA', setor:'Garcia', denominacao:'Outra', endereco:'Rua da Glória 1390, Garcia - Blumenau - SC', culto:'', pastor1:'Adalson', esposa1:'', pastor2:'', esposa2:'', telefone:'47 99162-3957', foto:'/fotos/sem-foto.jpg' },
  { id:1160, lat:-26.9187, lng:-49.0721, nome:'Igreja Cristã Maranata', setor:'Velha Central', denominacao:'Outra', endereco:'Rua Divinópolis 496, Velha Central - Blumenau - SC', culto:'', pastor1:'', esposa1:'', pastor2:'', esposa2:'', telefone:'47 99673-4849', foto:'/fotos/sem-foto.jpg' },
  { id:1161, lat:-26.8646, lng:-49.0484, nome:'Igreja Pentecostal Nova Israel', setor:'Itoupava Norte', denominacao:'Outra', endereco:'Rua Dois de Setembro 2093 Sala 06, Itoupava Norte - Blumenau - SC', culto:'', pastor1:'', esposa1:'', pastor2:'', esposa2:'', telefone:'47 99645-3419', foto:'/fotos/sem-foto.jpg' },
  { id:1162, lat:-26.8740, lng:-49.0520, nome:'Igreja Templo de Deus', setor:'Itoupava Central', denominacao:'Outra', endereco:'Rua Alfredo José Gonçalves 230, Itoupava Central - Blumenau - SC', culto:'', pastor1:'', esposa1:'', pastor2:'', esposa2:'', telefone:'47 99222-9133', foto:'/fotos/sem-foto.jpg' },
  { id:1163, lat:-26.8601, lng:-49.0501, nome:'Igreja Resgate dos Filhos de Deus Ministério Bispo Rodrigo', setor:'Itoupava Norte', denominacao:'Outra', endereco:'Rua dois de setembro 3520, Itoupava Norte - Blumenau - SC', culto:'', pastor1:'Bp. Rodrigo', esposa1:'', pastor2:'', esposa2:'', telefone:'47 99289-0753', foto:'/fotos/sem-foto.jpg' },
  { id:1164, lat:-26.8611, lng:-49.0453, nome:'Igreja Ass. de Deus Ministério Madureira', setor:'Itoupava Norte', denominacao:'Outra', endereco:'Rua 25 de Julho 770, Itoupava Norte - Blumenau - SC', culto:'', pastor1:'Pr. Jairo Cardoso', esposa1:'', pastor2:'', esposa2:'', telefone:'47 99981-1276', foto:'/fotos/sem-foto.jpg' },
  { id:1165, lat:-26.8601, lng:-49.0451, nome:'Comunidade Rio de Deus', setor:'Itoupava Norte', denominacao:'Outra', endereco:'Rua dois de Setembro 4418, Itoupava Norte - Blumenau - SC', culto:'', pastor1:'Pr. Cristiano', esposa1:'', pastor2:'', esposa2:'', telefone:'47 3322-8607', foto:'/fotos/sem-foto.jpg' },
  { id:1166, lat:-26.8614, lng:-49.0473, nome:'Igreja Universal', setor:'Itoupava Norte', denominacao:'Outra', endereco:'Rua dois de Setembro 4011, Itoupava Norte - Blumenau - SC', culto:'', pastor1:'', esposa1:'', pastor2:'', esposa2:'', telefone:'48 3216-6162', foto:'/fotos/sem-foto.jpg' },
]

function markerIcon(label, color, selecionado = false, visitado = false, denominacao = DENOMINACAO_PADRAO, prioridade = 'media') {
  const isOutra = denominacao !== DENOMINACAO_PADRAO
  const isAlta  = prioridade === 'alta'
  const bg      = visitado ? '#10b981' : color
  const glow    = selecionado
    ? `0 0 0 3px rgba(255,255,255,0.9), 0 0 0 5px ${bg}88, 0 4px 16px rgba(0,0,0,.6)`
    : isAlta
      ? `0 0 0 2px ${bg}66, 0 0 12px ${bg}55, 0 2px 8px rgba(0,0,0,.5)`
      : '0 2px 8px rgba(0,0,0,.45), 0 1px 3px rgba(0,0,0,.3)'

  if (isOutra) {
    return L.divIcon({
      className: '',
      html: `<div style="position:relative;width:30px;height:30px;">
               <div style="position:absolute;inset:0;background:${bg};
                    border:2px solid rgba(255,255,255,0.85);border-radius:5px;
                    transform:rotate(45deg);box-shadow:${glow};"></div>
               <div style="position:absolute;inset:0;display:flex;align-items:center;
                    justify-content:center;color:#fff;font-size:13px;font-weight:800;
                    line-height:1;">✝</div>
             </div>`,
      iconSize:   [30, 30],
      iconAnchor: [15, 15],
      popupAnchor:[0, -15],
    })
  }
  const txt = visitado ? '✓' : label
  return L.divIcon({
    className: '',
    html: `<div style="background:linear-gradient(135deg,${bg}ee,${bg});color:#fff;
           width:34px;height:34px;border-radius:50%;
           display:flex;align-items:center;justify-content:center;
           font-size:11px;font-weight:800;letter-spacing:-0.5px;
           border:2.5px solid rgba(255,255,255,0.9);
           box-shadow:${glow}">${txt}</div>`,
    iconSize:   [34, 34],
    iconAnchor: [17, 17],
    popupAnchor:[0, -17],
  })
}


function sleep(ms) { return new Promise(r => setTimeout(r, ms)) }

async function geocodeEndereco(endereco) {
  const headers = { 'Accept-Language': 'pt-BR', 'User-Agent': 'MapaADBluApp/1.0' }
  async function tryQuery(q) {
    try {
      const res  = await fetch(`https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(q)}&format=json&limit=1&countrycodes=br`, { headers })
      const data = await res.json()
      if (data.length > 0) return { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) }
    } catch {}
    return null
  }
  const r1 = await tryQuery(endereco)
  if (r1) return r1
  await sleep(700)
  return await tryQuery(endereco.replace(/,\s*\d+/, '').trim())
}

function isInRing(x, y, ring) {
  let inside = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i], [xj, yj] = ring[j]
    if (((yi > y) !== (yj > y)) && x < (xj - xi) * (y - yi) / (yj - yi) + xi)
      inside = !inside
  }
  return inside
}
function pointInFeature(lng, lat, feature) {
  const g = feature.geometry
  if (g.type === 'Polygon')      return isInRing(lng, lat, g.coordinates[0])
  if (g.type === 'MultiPolygon') return g.coordinates.some(p => isInRing(lng, lat, p[0]))
  return false
}

async function buscarRota(waypoints) {
  const coords = waypoints.map(p => `${p[1]},${p[0]}`).join(';')
  const url = `https://router.project-osrm.org/route/v1/driving/${coords}?overview=full&geometries=geojson`
  const res = await fetch(url)
  const data = await res.json()
  if (data.code === 'Ok' && data.routes?.[0]) {
    const r = data.routes[0]
    return {
      linha:     r.geometry.coordinates.map(c => [c[1], c[0]]),
      distancia: (r.distance / 1000).toFixed(1),
      duracao:   Math.round(r.duration / 60),
    }
  }
  return null
}

function FitBounds({ bounds }) {
  const map = useMap()
  useEffect(() => { if (bounds) map.fitBounds(bounds, { padding: [50, 50] }) }, [bounds])
  return null
}

function FlyTo({ point }) {
  const map = useMap()
  useEffect(() => { if (point) map.flyTo(point.coords, 17, { duration: 1.0 }) }, [point])
  return null
}

export default function MapaIgrejas() {
  const [igrejas, setIgrejas] = useState(() => {
    const saved    = JSON.parse(localStorage.getItem('pastores_igrejas')   || '{}')
    const coords   = JSON.parse(localStorage.getItem('geo_coords_igrejas') || '{}')
    const visitas  = JSON.parse(localStorage.getItem('igrejas_visitas')   || '{}')
    const notas    = JSON.parse(localStorage.getItem('igrejas_notas')     || '{}')
    const prioridades = JSON.parse(localStorage.getItem('igrejas_prioridades') || '{}')
    const customRaw = JSON.parse(localStorage.getItem('igrejas_custom')   || '[]')
    const base = IGREJAS_BASE.map(i => ({
      ...i,
      lat:    coords[i.id]?.lat ?? i.lat,
      lng:    coords[i.id]?.lng ?? i.lng,
      status: 'ok',
      denominacao: i.denominacao || DENOMINACAO_PADRAO,
      pastor1: saved[i.id]?.pastor1 || '',
      esposa1: saved[i.id]?.esposa1 || '',
      pastor2: saved[i.id]?.pastor2 || '',
      esposa2: saved[i.id]?.esposa2 || '',
      visitado: visitas[i.id] || false,
      nota: notas[i.id] || '',
      prioridade: prioridades[i.id] || 'media',
    }))
    const externas = IGREJAS_EXTERNAS.map(i => ({
      ...i,
      lat:    coords[i.id]?.lat ?? i.lat,
      lng:    coords[i.id]?.lng ?? i.lng,
      status: 'ok',
      denominacao: 'Outra',
      pastor1: saved[i.id]?.pastor1 ?? i.pastor1 ?? '',
      esposa1: saved[i.id]?.esposa1 ?? i.esposa1 ?? '',
      pastor2: saved[i.id]?.pastor2 ?? i.pastor2 ?? '',
      esposa2: saved[i.id]?.esposa2 ?? i.esposa2 ?? '',
      visitado: visitas[i.id] || false,
      nota: notas[i.id] || '',
      prioridade: prioridades[i.id] || 'media',
    }))
    const custom = customRaw.map(i => ({
      ...i,
      lat:    coords[i.id]?.lat ?? i.lat,
      lng:    coords[i.id]?.lng ?? i.lng,
      status: 'ok',
      foto: i.foto || '/fotos/sem-foto.jpg',
      pastor1: saved[i.id]?.pastor1 || '',
      esposa1: saved[i.id]?.esposa1 || '',
      pastor2: saved[i.id]?.pastor2 || '',
      esposa2: saved[i.id]?.esposa2 || '',
      visitado: visitas[i.id] || false,
      nota: notas[i.id] || '',
      prioridade: prioridades[i.id] || 'media',
    }))
    return [...base, ...externas, ...custom]
  })
  const [aba, setAba]             = useState('igrejas')
  const [rota, setRota]           = useState(null)
  const [rotaLoad, setRotaLoad]   = useState(false)
  const [filtroSetor, setFiltroSetor] = useState('Todos')
  const [fitBounds, setFitBounds] = useState(null)
  const [paradas, setParadas]     = useState([])
  const [editandoId, setEditandoId] = useState(null)
  const [editForm, setEditForm]   = useState({ pastor1:'', esposa1:'', pastor2:'', esposa2:'' })
  const [bairrosGeo, setBairrosGeo] = useState(null)
  const [bairroCores, setBairroCores] = useState({})
  const [showBairros, setShowBairros]       = useState(true)
  const [mostrarLegenda, setMostrarLegenda] = useState(true)
  const [igrejasPorBairro, setIgrejasPorBairro] = useState({})
  const [bairroAberto, setBairroAberto]     = useState(null)
  const [flyToPoint, setFlyToPoint]         = useState(null)
  const [geoProg, setGeoProg]               = useState(0)
  const [geoTotal, setGeoTotal]             = useState(0)
  const [mostrarNovo, setMostrarNovo]       = useState(false)
  const [novoForm, setNovoForm]             = useState({ nome:'', setor:'', denominacao:DENOMINACAO_PADRAO, endereco:'', culto:'', foto:'' })
  const okCount = igrejas.length
  const outrasCount = igrejas.filter(i => i.denominacao !== DENOMINACAO_PADRAO).length

  useEffect(() => {
    const CACHE_KEY = 'geo_coords_igrejas'
    const cached    = JSON.parse(localStorage.getItem(CACHE_KEY) || '{}')
    const semCache  = IGREJAS_BASE.filter(ig => !cached[ig.id])
    if (!semCache.length) return
    setGeoTotal(semCache.length)
    let current   = { ...cached }
    let cancelled = false
    ;(async () => {
      for (let i = 0; i < semCache.length; i++) {
        if (cancelled) break
        await sleep(1150)
        const ig     = semCache[i]
        const coords = await geocodeEndereco(ig.endereco)
        if (coords) {
          current[ig.id] = coords
          localStorage.setItem(CACHE_KEY, JSON.stringify(current))
          setIgrejas(prev => prev.map(p => p.id === ig.id ? { ...p, ...coords } : p))
        }
        setGeoProg(i + 1)
      }
      setGeoTotal(0)
      setGeoProg(0)
    })()
    return () => { cancelled = true }
  }, [])

  useEffect(() => {
    fetch('/bairros.geojson')
      .then(r => r.json())
      .then(data => {
        setBairrosGeo(data)
        const cores = {}
        const total = data.features.length
        data.features
          .slice()
          .sort((a, b) => a.properties.name.localeCompare(b.properties.name))
          .forEach((f, i) => {
            const h = Math.round(i * 360 / total)
            cores[f.properties.name] = `hsl(${h},62%,48%)`
          })
        setBairroCores(cores)
      })
      .catch(() => {})
  }, [])

  useEffect(() => {
    if (!bairrosGeo || !igrejas.length) return
    const norm = s => s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim()
    const featuresSorted = [...bairrosGeo.features].sort(
      (a, b) => b.properties.name.length - a.properties.name.length
    )
    const mapa = {}
    bairrosGeo.features.forEach(f => { mapa[f.properties.name] = [] })
    igrejas.forEach(ig => {
      if (!ig.lat || !ig.lng) return
      let assigned = false
      for (const feat of featuresSorted) {
        if (pointInFeature(ig.lng, ig.lat, feat)) {
          mapa[feat.properties.name].push(ig)
          assigned = true
          break
        }
      }
      if (!assigned) {
        const endNorm  = norm(ig.endereco)
        const setorNorm = norm(ig.setor || '')
        // formato ADB: "- Bairro, Blumenau"
        const addrBairro1 = (endNorm.match(/-\s*([^,\-]+),\s*(blumenau|gaspar|indaial|timbó|pomerode)/) || [])[1]?.trim() || ''
        // formato externas: "Bairro - Blumenau"
        const addrBairro2 = (endNorm.match(/([a-záàãâéêíóôõúüç\s]+)\s*-\s*(blumenau|gaspar|indaial|timbó|pomerode)/i) || [])[1]?.trim() || ''
        for (const feat of featuresSorted) {
          const nomN = norm(feat.properties.name)
          const m1 = addrBairro1 && (addrBairro1 === nomN || addrBairro1.includes(nomN) || nomN.includes(addrBairro1))
          const m2 = addrBairro2 && (addrBairro2 === nomN || addrBairro2.includes(nomN) || nomN.includes(addrBairro2))
          const mS = setorNorm && (setorNorm === nomN || setorNorm.includes(nomN) || nomN.includes(setorNorm))
          if (m1 || m2 || mS) {
            mapa[feat.properties.name].push(ig)
            break
          }
        }
      }
    })
    setIgrejasPorBairro(mapa)
  }, [bairrosGeo, igrejas])

  useEffect(() => {
    if (!bairrosGeo || Object.keys(igrejasPorBairro).length === 0) return
    const counts = Object.values(igrejasPorBairro).map(v => v.length)
    const maxCnt = Math.max(...counts, 1)
    const cores = {}
    bairrosGeo.features.forEach(f => {
      const nome = f.properties.name
      const cnt  = (igrejasPorBairro[nome] || []).length
      if (cnt === 0) {
        cores[nome] = 'rgba(255,255,255,0.04)'
      } else {
        const t = cnt / maxCnt
        const adb   = (igrejasPorBairro[nome] || []).filter(i => i.denominacao === DENOMINACAO_PADRAO).length
        const ratio = cnt > 0 ? adb / cnt : 1
        const r = Math.round(6   + (1 - ratio) * 120 + t * 20)
        const g = Math.round(100 + ratio * 82  - t * 30)
        const b = Math.round(212 - t * 80)
        const a = 0.22 + t * 0.50
        cores[nome] = `rgba(${r},${g},${b},${a.toFixed(2)})`
      }
    })
    setBairroCores(cores)
  }, [igrejasPorBairro, bairrosGeo])

  function abrirEdicao(ig, e) {
    e.stopPropagation()
    setEditandoId(ig.id)
    setEditForm({
      pastor1: ig.pastor1, esposa1: ig.esposa1, pastor2: ig.pastor2, esposa2: ig.esposa2,
      nome: ig.nome, setor: ig.setor, endereco: ig.endereco, culto: ig.culto, denominacao: ig.denominacao || DENOMINACAO_PADRAO,
    })
  }

  function salvarPastores(id) {
    setIgrejas(prev => prev.map(x => x.id === id ? { ...x, ...editForm } : x))
    const saved = JSON.parse(localStorage.getItem('pastores_igrejas') || '{}')
    saved[id] = { pastor1: editForm.pastor1, esposa1: editForm.esposa1, pastor2: editForm.pastor2, esposa2: editForm.esposa2 }
    localStorage.setItem('pastores_igrejas', JSON.stringify(saved))
    if (id > MAX_ID_EXTERNAS) {
      const custom = JSON.parse(localStorage.getItem('igrejas_custom') || '[]').map(i =>
        i.id === id ? { ...i, nome: editForm.nome, setor: editForm.setor, endereco: editForm.endereco, culto: editForm.culto, denominacao: editForm.denominacao } : i
      )
      localStorage.setItem('igrejas_custom', JSON.stringify(custom))
    }
    setEditandoId(null)
  }

  function toggleVisitado(id) {
    setIgrejas(prev => {
      const updated = prev.map(x => x.id === id ? { ...x, visitado: !x.visitado } : x)
      const visitas = JSON.parse(localStorage.getItem('igrejas_visitas') || '{}')
      visitas[id] = !visitas[id]
      localStorage.setItem('igrejas_visitas', JSON.stringify(visitas))
      return updated
    })
  }

  function salvarNota(id, nota) {
    setIgrejas(prev => prev.map(x => x.id === id ? { ...x, nota } : x))
    const notas = JSON.parse(localStorage.getItem('igrejas_notas') || '{}')
    notas[id] = nota
    localStorage.setItem('igrejas_notas', JSON.stringify(notas))
  }

  function setPrioridade(id, prioridade) {
    setIgrejas(prev => prev.map(x => x.id === id ? { ...x, prioridade } : x))
    const prioridades = JSON.parse(localStorage.getItem('igrejas_prioridades') || '{}')
    prioridades[id] = prioridade
    localStorage.setItem('igrejas_prioridades', JSON.stringify(prioridades))
  }

  function toggleParada(id) {
    setParadas(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    )
    setRota(null)
  }

  function moverParada(idx, dir) {
    setParadas(prev => {
      const arr = [...prev]
      const troca = idx + dir
      if (troca < 0 || troca >= arr.length) return arr
      ;[arr[idx], arr[troca]] = [arr[troca], arr[idx]]
      return arr
    })
    setRota(null)
  }

  async function calcularRota() {
    const pts = paradas.map(id => igrejas.find(i => i.id === id)).filter(i => i?.status === 'ok')
    if (pts.length < 2) return
    setRotaLoad(true)
    try {
      const resultado = await buscarRota(pts.map(i => [i.lat, i.lng]))
      if (resultado) {
        setRota(resultado)
        setFitBounds(resultado.linha.reduce(
          (b, p) => [[Math.min(b[0][0],p[0]),Math.min(b[0][1],p[1])],[Math.max(b[1][0],p[0]),Math.max(b[1][1],p[1])]],
          [[90,180],[-90,-180]]
        ))
      }
    } catch { setRota(null) }
    setRotaLoad(false)
  }

  function fitTodasIgrejas() {
    const pts = igrejas.filter(i => i.status === 'ok').map(i => [i.lat, i.lng])
    if (!pts.length) return
    setFitBounds(pts.reduce(
      (b, p) => [[Math.min(b[0][0],p[0]),Math.min(b[0][1],p[1])],[Math.max(b[1][0],p[0]),Math.max(b[1][1],p[1])]],
      [[90,180],[-90,-180]]
    ))
  }

  function adicionarIgreja() {
    if (!novoForm.nome.trim() || !novoForm.endereco.trim() || !novoForm.setor.trim()) return
    const maxId = Math.max(MAX_ID_EXTERNAS, ...igrejas.map(i => i.id))
    const nova = {
      id: maxId + 1,
      nome: novoForm.nome.trim(),
      setor: novoForm.setor.trim(),
      denominacao: novoForm.denominacao || DENOMINACAO_PADRAO,
      endereco: novoForm.endereco.trim(),
      culto: novoForm.culto.trim() || 'Dom 18:30',
      foto: novoForm.foto.trim() || '/fotos/sem-foto.jpg',
      lat: BLUMENAU[0],
      lng: BLUMENAU[1],
      status: 'ok',
      pastor1:'', esposa1:'', pastor2:'', esposa2:'',
      visitado:false, nota:'', prioridade:'media',
    }
    const custom = JSON.parse(localStorage.getItem('igrejas_custom') || '[]')
    custom.push(nova)
    localStorage.setItem('igrejas_custom', JSON.stringify(custom))
    setIgrejas(prev => [...prev, nova])
    setNovoForm({ nome:'', setor:'', denominacao:DENOMINACAO_PADRAO, endereco:'', culto:'', foto:'' })
    setMostrarNovo(false)
    geocodeEndereco(nova.endereco).then(coords => {
      if (!coords) return
      const cache = JSON.parse(localStorage.getItem('geo_coords_igrejas') || '{}')
      cache[nova.id] = coords
      localStorage.setItem('geo_coords_igrejas', JSON.stringify(cache))
      setIgrejas(prev => prev.map(i => i.id === nova.id ? { ...i, ...coords } : i))
    })
  }

  function removerIgreja(id, e) {
    e.stopPropagation()
    if (!window.confirm('Tem certeza que deseja remover esta igreja?')) return
    const custom = JSON.parse(localStorage.getItem('igrejas_custom') || '[]').filter(i => i.id !== id)
    localStorage.setItem('igrejas_custom', JSON.stringify(custom))
    setIgrejas(prev => prev.filter(i => i.id !== id))
    setParadas(prev => prev.filter(p => p !== id))
  }

  const setores = ['Todos', ...Object.keys(SETORES), '— Outras Denominações']
  const igrejasVisiveis = filtroSetor === 'Todos'
    ? igrejas
    : filtroSetor === '— Outras Denominações'
      ? igrejas.filter(i => i.denominacao !== DENOMINACAO_PADRAO)
      : igrejas.filter(i => i.setor === filtroSetor)

  const paradasDetalhes = paradas.map(id => igrejas.find(i => i.id === id)).filter(Boolean)

  return (
    <div className="flex flex-col md:flex-row flex-1 overflow-hidden" style={{ background: '#08080d' }}>

      {/* ─── Painel esquerdo ─────────────────────────────────────── */}
      <div className="w-full md:w-80 max-h-[50vh] md:max-h-none flex flex-col srf z-10" style={{ boxShadow: '0 4px 24px rgba(0,0,0,0.10)', borderBottom: '1px solid rgba(255,255,255,0.12)' }}>

        {/* Header gradient */}
        <div className="flex-shrink-0 px-5 py-5" style={{ background: 'linear-gradient(135deg,#1e3a8a 0%,#1d4ed8 55%,#1e40af 100%)' }}>
          <div className="flex items-center gap-3 mb-4">
            <div className="w-11 h-11 rounded-2xl flex items-center justify-center flex-shrink-0" style={{ background: 'rgba(255,255,255,0.18)', backdropFilter: 'blur(8px)' }}>
              <Church size={22} className="text-white"/>
            </div>
            <div>
              <h2 className="font-bold text-white leading-tight" style={{ fontSize: 14 }}>Igrejas e Assembleias</h2>
              <p className="text-blue-200 mt-0.5" style={{ fontSize: 11 }}>Blumenau — Santa Catarina</p>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            {[
              { label: 'Igrejas AD',  value: okCount - outrasCount },
              { label: 'Outras denominações',  value: outrasCount, highlight: outrasCount > 0 },
            ].map(({ label, value, highlight }) => (
              <div key={label} className="rounded-xl px-2 py-2 text-center" style={{ background: highlight ? 'rgba(245,158,11,0.28)' : 'rgba(255,255,255,0.13)', border: highlight ? '1px solid rgba(245,158,11,0.5)' : 'none' }}>
                <p className="font-bold leading-none" style={{ fontSize: 18, color: highlight ? '#fbbf24' : '#fff' }}>{value}</p>
                <p className="mt-0.5" style={{ fontSize: 10, color: highlight ? '#fcd34d' : '#bfdbfe' }}>{label}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Tabs pill */}
        <div className="px-3 pt-3 pb-1 flex-shrink-0">
          <div className="flex rounded-xl p-1 gap-0.5" style={{ background: 'rgba(255,255,255,0.07)' }}>
            {[
              { id: 'igrejas', icon: <MapPin size={10}/>,  label: 'Igrejas', color: '#1d4ed8' },
              { id: 'bairros', icon: <Map size={10}/>,     label: 'Bairros', color: '#059669' },
              { id: 'rota',    icon: <Route size={10}/>,   label: 'Rota',    color: '#1e4fd6',
                badge: paradas.length > 0 ? paradas.length : null },
            ].map(t => (
              <button key={t.id} onClick={() => setAba(t.id)}
                className="flex-1 text-xs font-semibold py-2 rounded-lg transition-all flex items-center justify-center gap-1"
                style={aba === t.id
                  ? { background: 'var(--bg-surface)', color: t.color, boxShadow: '0 1px 4px rgba(0,0,0,0.10)' }
                  : { color: 'rgba(203,213,235,0.55)' }}>
                {t.icon} {t.label}
                {t.badge && (
                  <span className="ml-0.5 text-white font-bold rounded-full flex items-center justify-center"
                    style={{ background: '#1e4fd6', fontSize: 9, width: 16, height: 16 }}>{t.badge}</span>
                )}
              </button>
            ))}
          </div>
        </div>

        {/* Adicionar igreja */}
        <div className="px-3 pt-2 pb-1 flex-shrink-0">
          <button onClick={() => setMostrarNovo(v => !v)}
            className="w-full flex items-center justify-center gap-2 text-xs font-semibold py-2 rounded-xl transition-all"
            style={{
              background: mostrarNovo ? 'rgba(239,68,68,0.22)' : 'rgba(37,99,235,0.16)',
              color: mostrarNovo ? '#fca5a5' : '#1d4ed8',
              border: mostrarNovo ? '1.5px solid #fecaca' : '1.5px solid rgba(37,99,235,0.22)',
            }}>
            {mostrarNovo ? <X size={12}/> : <Plus size={12}/>}
            {mostrarNovo ? 'Cancelar' : 'Adicionar igreja'}
          </button>
        </div>

        {/* ── Aba Igrejas ── */}
        {aba === 'igrejas' && (
          <>
            {/* Filtro por setor */}
            <div className="px-3 py-2 flex-shrink-0">
              <select
                value={filtroSetor}
                onChange={e => setFiltroSetor(e.target.value)}
                className="w-full text-xs rounded-xl px-3 py-2 focus:outline-none focus:ring-2 srf"
                style={{
                  border: filtroSetor !== 'Todos' ? `2px solid ${SETORES[filtroSetor]}` : '1.5px solid rgba(255,255,255,0.12)',
                  color: filtroSetor !== 'Todos' ? SETORES[filtroSetor] : 'rgba(235,240,255,0.92)',
                  fontWeight: 600,
                }}>
                {setores.map(s => (
                  <option key={s} value={s}>{s}{s !== 'Todos' ? ` (${igrejas.filter(i => i.setor === s).length})` : ` (${igrejas.length})`}</option>
                ))}
              </select>
            </div>

            {/* Formulário de nova igreja */}
            {mostrarNovo && (
              <div className="px-3 pb-2 flex-shrink-0">
                <div className="rounded-2xl p-3 space-y-2" style={{ background: 'rgba(255,255,255,0.04)', border: '1.5px solid rgba(255,255,255,0.12)' }}>
                  <p className="text-xs font-bold txt-2 flex items-center gap-1">
                    <Church size={10}/> Nova igreja
                  </p>
                  <input placeholder="Nome da igreja" value={novoForm.nome}
                    onChange={e => setNovoForm(p => ({ ...p, nome: e.target.value }))}
                    className="w-full text-xs border brd-soft rounded-xl px-2.5 py-1.5 srf focus:outline-none focus:ring-2 focus:ring-blue-300"/>
                  <select value={novoForm.denominacao}
                    onChange={e => setNovoForm(p => ({ ...p, denominacao: e.target.value }))}
                    className="w-full text-xs border brd-soft rounded-xl px-2.5 py-1.5 srf focus:outline-none focus:ring-2 focus:ring-blue-300">
                    {DENOMINACOES.map(d => <option key={d} value={d}>{d}</option>)}
                  </select>
                  <input placeholder="Setor / bairro" value={novoForm.setor}
                    onChange={e => setNovoForm(p => ({ ...p, setor: e.target.value }))}
                    className="w-full text-xs border brd-soft rounded-xl px-2.5 py-1.5 srf focus:outline-none focus:ring-2 focus:ring-blue-300"/>
                  <input placeholder="Endereço completo" value={novoForm.endereco}
                    onChange={e => setNovoForm(p => ({ ...p, endereco: e.target.value }))}
                    className="w-full text-xs border brd-soft rounded-xl px-2.5 py-1.5 srf focus:outline-none focus:ring-2 focus:ring-blue-300"/>
                  <input placeholder="Horários de culto (opcional)" value={novoForm.culto}
                    onChange={e => setNovoForm(p => ({ ...p, culto: e.target.value }))}
                    className="w-full text-xs border brd-soft rounded-xl px-2.5 py-1.5 srf focus:outline-none focus:ring-2 focus:ring-blue-300"/>
                  <button onClick={adicionarIgreja}
                    disabled={!novoForm.nome.trim() || !novoForm.endereco.trim() || !novoForm.setor.trim()}
                    className="w-full flex items-center justify-center gap-1 text-white text-xs font-bold py-2 rounded-xl transition-colors disabled:opacity-50"
                    style={{ background: '#1d4ed8' }}>
                    <Save size={10}/> Salvar igreja
                  </button>
                </div>
              </div>
            )}

            {/* Painel de contagem por denominação */}
            {(() => {
              const denCount = {}
              igrejas.forEach(i => {
                const d = i.denominacao || DENOMINACAO_PADRAO
                denCount[d] = (denCount[d] || 0) + 1
              })
              const entries = Object.entries(denCount).sort((a, b) => b[1] - a[1])
              return (
                <div className="px-3 pb-2 flex-shrink-0">
                  <div className="rounded-2xl p-2.5" style={{ background: 'rgba(255,255,255,0.04)', border: '1.5px solid rgba(255,255,255,0.08)' }}>
                    <p className="text-[9px] font-bold uppercase tracking-widest txt-3 mb-2">Por Denominação</p>
                    <div className="space-y-1">
                      {entries.map(([den, cnt]) => {
                        const cor = COR_DENOMINACAO[den] || '#3b82f6'
                        const pct = Math.round((cnt / igrejas.length) * 100)
                        return (
                          <div key={den}>
                            <div className="flex items-center justify-between mb-0.5">
                              <span className="text-[10px] font-semibold txt-2 truncate" style={{ maxWidth: 140 }}>{den}</span>
                              <span className="text-[10px] font-bold tnum" style={{ color: cor }}>{cnt}</span>
                            </div>
                            <div className="h-1 rounded-full" style={{ background: 'rgba(255,255,255,0.08)' }}>
                              <div className="h-1 rounded-full transition-all" style={{ width: `${pct}%`, background: cor }} />
                            </div>
                          </div>
                        )
                      })}
                    </div>
                    <p className="text-[9px] txt-4 mt-2 text-right">{igrejas.length} igrejas no total</p>
                  </div>
                </div>
              )
            })()}

            {/* Lista de igrejas */}
            <div className="flex-1 overflow-y-auto px-3 pb-2 space-y-1.5">
              {igrejasVisiveis.map(ig => {
                const cor = SETORES[ig.setor] || 'rgba(203,213,235,0.55)'
                const corDen = COR_DENOMINACAO[ig.denominacao] || 'rgba(203,213,235,0.55)'
                const isOutra = ig.denominacao !== DENOMINACAO_PADRAO
                const naRota = paradas.includes(ig.id)
                const editando = editandoId === ig.id
                const isCustom = ig.id > MAX_ID_BASE
                return (
                  <div key={ig.id}
                    className="rounded-2xl transition-all overflow-hidden"
                    style={{
                      background: naRota ? 'rgba(37,99,235,0.16)' : 'var(--bg-raised)',
                      borderTop:    naRota ? '1.5px solid #93c5fd' : '1.5px solid rgba(255,255,255,0.07)',
                      borderRight:  naRota ? '1.5px solid #93c5fd' : '1.5px solid rgba(255,255,255,0.07)',
                      borderBottom: naRota ? '1.5px solid #93c5fd' : '1.5px solid rgba(255,255,255,0.07)',
                      boxShadow: naRota ? '0 2px 8px rgba(59,130,246,0.12)' : '0 1px 3px rgba(0,0,0,0.05)',
                      borderLeft: `4px solid ${naRota ? '#3b82f6' : (isOutra ? corDen : cor)}`,
                    }}>
                    {/* Linha principal */}
                    <div className="px-3 py-2.5 flex items-start gap-2.5 cursor-pointer"
                      onClick={() => { toggleParada(ig.id); setFlyToPoint({ coords: [ig.lat, ig.lng], ts: Date.now() }) }}>
                      <div className="flex-shrink-0 w-7 h-7 rounded-xl flex items-center justify-center text-xs font-bold text-white mt-0.5"
                        style={{ backgroundColor: isOutra ? corDen : cor, boxShadow: `0 2px 6px ${isOutra ? corDen : cor}55` }}>
                        {isOutra ? '✝' : ig.id}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-bold txt-1 truncate" style={{ fontSize: 12 }}>{ig.nome}</p>
                        {isOutra && (
                          <span className="inline-block text-[9px] font-bold px-1.5 py-0.5 rounded-md mt-0.5 mb-0.5"
                            style={{ background: `${corDen}18`, color: corDen }}>{ig.denominacao}</span>
                        )}
                        <p className="txt-3 truncate mt-0.5" style={{ fontSize: 10 }}>{ig.endereco}</p>
                        {(ig.pastor1 || ig.pastor2) && (
                          <p className="flex items-center gap-0.5 mt-0.5 truncate" style={{ fontSize: 10, color: '#3b82f6' }}>
                            <User size={9}/> {ig.pastor1}{ig.pastor2 ? ` · ${ig.pastor2}` : ''}
                          </p>
                        )}
                      </div>
                      <div className="flex items-center gap-1.5 flex-shrink-0 mt-0.5">
                        <button onClick={e => abrirEdicao(ig, e)}
                          className="p-1 rounded-lg transition-colors"
                          style={{ color: 'rgba(203,213,235,0.45)', background: 'transparent' }}
                          onMouseEnter={e => e.currentTarget.style.color='#3b82f6'}
                          onMouseLeave={e => e.currentTarget.style.color='rgba(203,213,235,0.45)'}>
                          <Pencil size={11}/>
                        </button>
                        {isCustom && (
                          <button onClick={e => removerIgreja(ig.id, e)}
                            className="p-1 rounded-lg transition-colors"
                            style={{ color: '#fca5a5', background: 'transparent' }}
                            onMouseEnter={e => e.currentTarget.style.color='#ef4444'}
                            onMouseLeave={e => e.currentTarget.style.color='#fca5a5'}>
                            <X size={11}/>
                          </button>
                        )}
                        <div className="w-4 h-4 rounded-full border-2 transition-all flex items-center justify-center"
                          style={naRota
                            ? { background: '#3b82f6', borderColor: '#3b82f6' }
                            : { borderColor: 'rgba(255,255,255,0.16)' }}>
                          {naRota && <div style={{ width: 6, height: 6, background: '#fff', borderRadius: '50%' }}/>}
                        </div>
                      </div>
                    </div>
                    {/* Painel de edição */}
                    {editando && (
                      <div className="px-3 pb-3 srf-soft border-t brd-soft" onClick={e => e.stopPropagation()}>
                        {isCustom && (
                          <>
                            <p className="text-xs font-bold txt-2 mt-2 mb-2 flex items-center gap-1">
                              <Church size={10}/> Dados da igreja
                            </p>
                            <div className="space-y-1.5 mb-2">
                              <input placeholder="Nome" value={editForm.nome}
                                onChange={e => setEditForm(p => ({ ...p, nome: e.target.value }))}
                                className="text-xs border brd-soft rounded-xl px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-300 w-full srf"/>
                              <div className="grid grid-cols-2 gap-1.5">
                                <input placeholder="Setor" value={editForm.setor}
                                  onChange={e => setEditForm(p => ({ ...p, setor: e.target.value }))}
                                  className="text-xs border brd-soft rounded-xl px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-300 w-full srf"/>
                                <select value={editForm.denominacao}
                                  onChange={e => setEditForm(p => ({ ...p, denominacao: e.target.value }))}
                                  className="text-xs border brd-soft rounded-xl px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-300 w-full srf">
                                  {DENOMINACOES.map(d => <option key={d} value={d}>{d}</option>)}
                                </select>
                              </div>
                              <input placeholder="Endereço" value={editForm.endereco}
                                onChange={e => setEditForm(p => ({ ...p, endereco: e.target.value }))}
                                className="text-xs border brd-soft rounded-xl px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-300 w-full srf"/>
                              <input placeholder="Cultos" value={editForm.culto}
                                onChange={e => setEditForm(p => ({ ...p, culto: e.target.value }))}
                                className="text-xs border brd-soft rounded-xl px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-300 w-full srf"/>
                            </div>
                          </>
                        )}
                        <p className="text-xs font-bold txt-2 mt-2 mb-2 flex items-center gap-1">
                          <User size={10}/> Pastores
                        </p>
                        <div className="grid grid-cols-2 gap-1.5">
                          {[
                            { key:'pastor1', label:'1º Pastor' },
                            { key:'esposa1', label:'Esposa 1' },
                            { key:'pastor2', label:'2º Pastor' },
                            { key:'esposa2', label:'Esposa 2' },
                          ].map(({ key, label }) => (
                            <input key={key} placeholder={label} value={editForm[key]}
                              onChange={e => setEditForm(p => ({ ...p, [key]: e.target.value }))}
                              className="text-xs border brd-soft rounded-xl px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-300 w-full srf" />
                          ))}
                        </div>
                        <div className="flex gap-2 mt-2">
                          <button onClick={() => salvarPastores(ig.id)}
                            className="flex-1 flex items-center justify-center gap-1 text-white text-xs font-bold py-2 rounded-xl transition-colors"
                            style={{ background: '#1d4ed8' }}>
                            <Save size={10}/> Salvar
                          </button>
                          <button onClick={() => setEditandoId(null)}
                            className="px-3 border text-xs rounded-xl transition-colors"
                            style={{ borderColor: 'rgba(255,255,255,0.12)', color: 'rgba(203,213,235,0.45)' }}>
                            <X size={11}/>
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>

            {/* Ações */}
            <div className="px-3 py-3 flex-shrink-0" style={{ borderTop: '1px solid rgba(255,255,255,0.07)' }}>
              <button onClick={fitTodasIgrejas}
                className="w-full flex items-center justify-center gap-2 text-xs font-semibold py-2.5 rounded-2xl transition-all"
                style={{ border: '1.5px solid rgba(255,255,255,0.12)', color: 'rgba(203,213,235,0.62)', background: 'rgba(255,255,255,0.04)' }}
                onMouseEnter={e => e.currentTarget.style.background='rgba(255,255,255,0.07)'}
                onMouseLeave={e => e.currentTarget.style.background='rgba(255,255,255,0.04)'}>
                <Navigation2 size={12}/> Centralizar no mapa
              </button>
            </div>
          </>
        )}

        {/* ── Aba Bairros ── */}
        {aba === 'bairros' && (
          <>
            {/* Stats header */}
            <div className="px-3 py-2.5 flex-shrink-0 flex items-center justify-between" style={{ borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
              <div>
                <p className="font-bold txt-1" style={{ fontSize: 12 }}>
                  {bairrosGeo ? `${bairrosGeo.features.length} bairros` : 'Carregando…'}
                </p>
                {Object.keys(igrejasPorBairro).length > 0 && (() => {
                  const comIgreja = Object.values(igrejasPorBairro).filter(v => v.length > 0).length
                  return <p className="txt-3 mt-0.5" style={{ fontSize: 10 }}>{comIgreja} com igrejas</p>
                })()}
              </div>
              <button onClick={() => setShowBairros(v => !v)}
                className="flex items-center gap-1.5 font-semibold px-3 py-1.5 rounded-xl transition-all"
                style={{
                  fontSize: 11,
                  background: showBairros ? '#d1fae5' : 'rgba(255,255,255,0.07)',
                  color: showBairros ? '#065f46' : 'rgba(203,213,235,0.60)',
                }}>
                <Layers size={11}/> {showBairros ? 'Visível' : 'Oculto'}
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-3 py-2 space-y-1">
              {bairrosGeo
                ? [...bairrosGeo.features]
                    .sort((a, b) => {
                      const ca = (igrejasPorBairro[a.properties.name] || []).length
                      const cb = (igrejasPorBairro[b.properties.name] || []).length
                      return cb - ca || a.properties.name.localeCompare(b.properties.name)
                    })
                    .map(feat => {
                      const nome   = feat.properties.name
                      const cor    = bairroCores[nome] || 'rgba(203,213,235,0.45)'
                      const lista  = igrejasPorBairro[nome] || []
                      const aberto = bairroAberto === nome
                      return (
                        <div key={feat.properties.id}
                          className="rounded-2xl overflow-hidden transition-all"
                          style={{
                            border: aberto ? `1.5px solid ${cor}55` : '1.5px solid rgba(255,255,255,0.07)',
                            background: aberto ? `${cor}08` : 'var(--bg-raised)',
                            boxShadow: aberto ? `0 2px 8px ${cor}22` : '0 1px 2px rgba(0,0,0,0.04)',
                          }}>
                          <button
                            onClick={() => setBairroAberto(aberto ? null : nome)}
                            className="w-full flex items-center gap-2.5 px-3 py-2.5 text-left">
                            <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: cor }} />
                            <span className="font-semibold txt-2 flex-1 truncate" style={{ fontSize: 12 }}>{nome}</span>
                            {lista.length > 0
                              ? <span className="font-bold text-white px-2 py-0.5 rounded-full flex-shrink-0"
                                  style={{ backgroundColor: cor, fontSize: 10 }}>
                                  {lista.length}
                                </span>
                              : <span className="txt-4 flex-shrink-0" style={{ fontSize: 11 }}>—</span>
                            }
                            {lista.length > 0 && (
                              <ChevronDown size={12} style={{ color: cor, flexShrink: 0, transform: aberto ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }}/>
                            )}
                          </button>
                          {aberto && lista.length > 0 && (
                            <div className="pb-2 px-3 space-y-1">
                              {lista.map(ig => {
                                const corDen = COR_DENOMINACAO[ig.denominacao] || 'rgba(203,213,235,0.55)'
                                const isOutra = ig.denominacao !== DENOMINACAO_PADRAO
                                return (
                                  <div key={ig.id}
                                    className="flex items-center gap-2 pl-4 py-1.5 rounded-xl cursor-pointer transition-all"
                                    style={{ background: 'rgba(255,255,255,0.04)' }}
                                    onClick={() => { setFlyToPoint({ coords: [ig.lat, ig.lng], ts: Date.now() }) }}>
                                    <div className="w-2 h-2 rounded-full flex-shrink-0"
                                      style={{ backgroundColor: isOutra ? corDen : (SETORES[ig.setor] || 'rgba(203,213,235,0.55)') }} />
                                    <span className="truncate font-medium txt-2" style={{ fontSize: 11 }}>{ig.nome}</span>
                                    {isOutra && <span className="text-[9px] px-1 rounded" style={{ background: `${corDen}18`, color: corDen }}>{ig.denominacao}</span>}
                                  </div>
                                )
                              })}
                            </div>
                          )}
                        </div>
                      )
                    })
                : <div className="text-center py-16" style={{ color: 'rgba(203,213,235,0.45)' }}>
                    <Map size={32} className="mx-auto mb-3" style={{ opacity: 0.25 }}/>
                    <p style={{ fontSize: 12 }}>Carregando bairros…</p>
                  </div>
              }
            </div>
          </>
        )}

        {/* ── Aba Rota ── */}
        {aba === 'rota' && (
          <>
            <div className="flex-1 overflow-y-auto px-3 py-3 space-y-1.5">
              {paradasDetalhes.length === 0 ? (
                <div className="text-center py-16 px-4">
                  <div className="w-16 h-16 rounded-3xl mx-auto mb-4 flex items-center justify-center" style={{ background: 'rgba(255,255,255,0.07)' }}>
                    <Route size={28} style={{ color: 'rgba(203,213,235,0.45)' }}/>
                  </div>
                  <p className="font-bold txt-2" style={{ fontSize: 13 }}>Nenhuma parada</p>
                  <p className="txt-3 mt-1 leading-relaxed" style={{ fontSize: 11 }}>Vá até "Igrejas" e clique nas igrejas para adicionar à rota</p>
                </div>
              ) : (
                paradasDetalhes.map((ig, idx) => {
                  const cor = SETORES[ig.setor] || 'rgba(203,213,235,0.55)'
                  const corDen = COR_DENOMINACAO[ig.denominacao] || 'rgba(203,213,235,0.55)'
                  const isOutra = ig.denominacao !== DENOMINACAO_PADRAO
                  return (
                    <div key={ig.id} className="flex items-center gap-2.5 rounded-2xl px-3 py-2.5"
                      style={{ background: 'var(--bg-surface)', borderTop: '1.5px solid rgba(255,255,255,0.07)', borderRight: '1.5px solid rgba(255,255,255,0.07)', borderBottom: '1.5px solid rgba(255,255,255,0.07)', boxShadow: '0 1px 3px rgba(0,0,0,0.05)', borderLeft: `4px solid ${isOutra ? corDen : cor}` }}>
                      <div className="flex-shrink-0 w-7 h-7 rounded-xl flex items-center justify-center text-xs font-bold text-white"
                        style={{ backgroundColor: isOutra ? corDen : cor, boxShadow: `0 2px 6px ${isOutra ? corDen : cor}55` }}>
                        {isOutra ? '✝' : idx + 1}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-bold txt-1 truncate" style={{ fontSize: 12 }}>{ig.nome}</p>
                        <p className="txt-3 truncate" style={{ fontSize: 10, color: isOutra ? corDen : cor }}>{ig.setor}{isOutra ? ` · ${ig.denominacao}` : ''}</p>
                      </div>
                      <div className="flex items-center gap-0.5 flex-shrink-0">
                        <button onClick={() => moverParada(idx, -1)} disabled={idx === 0}
                          className="p-1 rounded-lg transition-colors disabled:opacity-25"
                          style={{ color: 'rgba(203,213,235,0.45)' }}>
                          <ChevronUp size={13}/>
                        </button>
                        <button onClick={() => moverParada(idx, 1)} disabled={idx === paradasDetalhes.length - 1}
                          className="p-1 rounded-lg transition-colors disabled:opacity-25"
                          style={{ color: 'rgba(203,213,235,0.45)' }}>
                          <ChevronDown size={13}/>
                        </button>
                        <button onClick={() => toggleParada(ig.id)}
                          className="p-1 rounded-lg transition-colors"
                          style={{ color: '#fca5a5' }}
                          onMouseEnter={e => e.currentTarget.style.color='#ef4444'}
                          onMouseLeave={e => e.currentTarget.style.color='#fca5a5'}>
                          <X size={12}/>
                        </button>
                      </div>
                    </div>
                  )
                })
              )}
            </div>

            {/* Info da rota */}
            {rota && (
              <div className="mx-3 mb-2 rounded-2xl p-3" style={{ background: 'linear-gradient(135deg,#ecfdf5,#d1fae5)', border: '1.5px solid #a7f3d0' }}>
                <p className="font-bold flex items-center gap-1.5 mb-2" style={{ fontSize: 11, color: '#065f46' }}>
                  <Route size={11}/> Rota calculada
                </p>
                <div className="grid grid-cols-3 gap-2 text-center">
                  {[
                    { label: 'Distância', value: `${rota.distancia} km` },
                    { label: 'Tempo',     value: `${rota.duracao} min` },
                    { label: 'Paradas',  value: paradas.length },
                  ].map(({ label, value }) => (
                    <div key={label} className="rounded-xl py-2" style={{ background: 'rgba(255,255,255,0.7)' }}>
                      <p className="font-bold" style={{ fontSize: 14, color: '#065f46' }}>{value}</p>
                      <p style={{ fontSize: 9, color: '#34d399' }}>{label}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Botões */}
            <div className="px-3 py-3 flex-shrink-0 space-y-2" style={{ borderTop: '1px solid rgba(255,255,255,0.07)' }}>
              <button onClick={calcularRota}
                disabled={paradasDetalhes.filter(i => i.status === 'ok').length < 2 || rotaLoad}
                className="w-full flex items-center justify-center gap-2 text-white font-bold py-3 rounded-2xl transition-all disabled:opacity-50"
                style={{ background: 'linear-gradient(135deg,#1d4ed8,#1e4fd6)', fontSize: 13, boxShadow: '0 4px 14px rgba(79,70,229,0.35)' }}>
                {rotaLoad ? <Loader2 size={15} className="animate-spin"/> : <Route size={15}/>}
                {rotaLoad ? 'Calculando…' : 'Calcular Rota'}
              </button>
              {paradas.length > 0 && (
                <button onClick={() => { setParadas([]); setRota(null) }}
                  className="w-full py-1.5 rounded-xl transition-colors"
                  style={{ fontSize: 11, color: '#f87171' }}>
                  Limpar seleção
                </button>
              )}
            </div>
          </>
        )}
      </div>

      {/* ─── Mapa ────────────────────────────────────────────────── */}
      <div className="flex-1 relative">

        {/* Overlay de estatísticas */}
        <div style={{ position:'absolute', top:12, right:12, zIndex:1000, pointerEvents:'none' }}>
          <div style={{
            background:'rgba(7,10,18,0.88)', backdropFilter:'blur(16px)',
            border:'1px solid rgba(255,255,255,0.10)', borderRadius:16,
            padding:'12px 16px', minWidth:172,
            boxShadow:'0 8px 32px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.06)'
          }}>
            <div style={{ display:'flex', alignItems:'center', gap:6, marginBottom:10 }}>
              <div style={{ width:6, height:6, borderRadius:'50%', background:'#2563eb', boxShadow:'0 0 6px #2563eb' }}></div>
              <span style={{ fontSize:9, fontWeight:700, color:'rgba(203,213,235,0.45)', textTransform:'uppercase', letterSpacing:'0.1em' }}>Igrejas Mapeadas</span>
            </div>
            <div style={{ display:'flex', flexDirection:'column', gap:7 }}>
              <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', gap:16 }}>
                <div style={{ display:'flex', alignItems:'center', gap:6 }}>
                  <div style={{ width:10, height:10, borderRadius:'50%', background:'#2563eb', border:'1.5px solid rgba(255,255,255,0.5)' }}></div>
                  <span style={{ fontSize:10, color:'rgba(203,213,235,0.65)' }}>Assembleia de Deus</span>
                </div>
                <span style={{ fontSize:14, fontWeight:800, color:'#5b9bff' }}>{igrejas.filter(i => i.denominacao === DENOMINACAO_PADRAO).length}</span>
              </div>
              <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', gap:16 }}>
                <div style={{ display:'flex', alignItems:'center', gap:6 }}>
                  <div style={{ width:10, height:10, borderRadius:2, transform:'rotate(45deg)', background:'#8b5cf6', border:'1.5px solid rgba(255,255,255,0.5)' }}></div>
                  <span style={{ fontSize:10, color:'rgba(203,213,235,0.65)' }}>Outras denominações</span>
                </div>
                <span style={{ fontSize:14, fontWeight:800, color:'#a78bfa' }}>{outrasCount}</span>
              </div>
              <div style={{ borderTop:'1px solid rgba(255,255,255,0.07)', paddingTop:7, display:'flex', alignItems:'center', justifyContent:'space-between' }}>
                <span style={{ fontSize:10, color:'rgba(203,213,235,0.4)' }}>Total geral</span>
                <span style={{ fontSize:16, fontWeight:800, color:'#fff' }}>{igrejas.length}</span>
              </div>
              {igrejas.filter(i => i.visitado).length > 0 && (
                <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
                  <span style={{ fontSize:9, color:'#10b981' }}>✓ Visitadas</span>
                  <span style={{ fontSize:11, fontWeight:700, color:'#10b981' }}>{igrejas.filter(i => i.visitado).length}</span>
                </div>
              )}
            </div>
          </div>
        </div>
        <MapContainer
          center={BLUMENAU}
          zoom={13}
          minZoom={10}
          maxZoom={18}
          maxBounds={BOUNDS}
          maxBoundsViscosity={0.8}
          style={{ width: '100%', height: '100%' }}
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
            url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
            subdomains='abcd'
            maxZoom={20}
          />
          {fitBounds && <FitBounds bounds={fitBounds} />}
          {flyToPoint && <FlyTo point={flyToPoint} />}

          {/* ── Camada de bairros ── */}
          {showBairros && bairrosGeo && Object.keys(bairroCores).length > 0 && (
            <GeoJSON
              key={`bairros-${Object.keys(bairroCores).length}-${Object.keys(igrejasPorBairro).length}`}
              data={bairrosGeo}
              style={feature => {
                const cor = bairroCores[feature.properties.name] || 'rgba(203,213,235,0.55)'
                return { fillColor: cor, weight: 2, opacity: 1, color: cor, fillOpacity: 0.18 }
              }}
              onEachFeature={(feature, layer) => {
                const nome  = feature.properties.name
                const cor   = bairroCores[nome] || 'rgba(203,213,235,0.55)'
                const count = (igrejasPorBairro[nome] || []).length
                const adbN  = (igrejasPorBairro[nome] || []).filter(i => i.denominacao === DENOMINACAO_PADRAO).length
                const outN  = count - adbN
                const label = count > 0
                  ? `<div style="font-weight:800;font-size:12px;margin-bottom:4px">${nome}</div>
                     <div style="font-size:11px;opacity:0.95">
                       <span style="display:inline-block;width:7px;height:7px;border-radius:50%;background:#5b9bff;margin-right:4px"></span>${adbN} ADB
                       ${outN > 0 ? `<span style="margin-left:8px"><span style="display:inline-block;width:7px;height:7px;border-radius:2px;background:#a78bfa;transform:rotate(45deg);margin-right:4px;vertical-align:1px"></span>${outN} outra${outN > 1 ? 's' : ''}</span>` : ''}
                     </div>
                     <div style="font-size:10px;opacity:0.65;margin-top:3px">Total: ${count}</div>`
                  : `<div style="font-weight:800;font-size:12px">${nome}</div><div style="font-size:10px;opacity:0.5;margin-top:2px">Sem igrejas</div>`
                layer.bindTooltip(label, {
                  permanent: true,
                  direction: 'center',
                  className: 'bairro-label',
                  opacity: 1,
                })
                layer.on('mouseover', () => { layer.setStyle({ fillOpacity: 0.45, weight: 3 }); layer.bringToFront() })
                layer.on('mouseout',  () =>   layer.setStyle({ fillOpacity: 0.18, weight: 2 }))
              }}
            />
          )}

          {igrejas.map((ig, idx) => {
            if (ig.status !== 'ok' || !ig.lat) return null
            const cor = SETORES[ig.setor] || 'rgba(203,213,235,0.55)'
            const corDen = COR_DENOMINACAO[ig.denominacao] || 'rgba(203,213,235,0.55)'
            const naRota = paradas.includes(ig.id)
            const ordemRota = paradas.indexOf(ig.id)
            const label = naRota ? String(ordemRota + 1) : ig.id
            const isOutra = ig.denominacao !== DENOMINACAO_PADRAO
            const markerCor = naRota ? '#1d4ed8' : (isOutra ? corDen : cor)
            return (
              <Marker key={ig.id} position={[ig.lat, ig.lng]}
                icon={markerIcon(label, markerCor, naRota, ig.visitado, ig.denominacao, ig.prioridade)}>
                <Popup minWidth={220}>
                  <div className="w-[220px]">
                    <div style={{ width: 'calc(100% + 18px)', marginLeft: -9, marginTop: -9, marginBottom: 8, borderRadius: '4px 4px 0 0', overflow: 'hidden', height: 120, background: '#0a0f1e', display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative' }}>
                      {ig.foto && ig.foto !== '/fotos/sem-foto.jpg' ? (
                        <img src={ig.foto} alt={ig.nome}
                          style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                          onError={e => {
                            e.target.style.display = 'none'
                            const sv = document.createElement('iframe')
                            sv.src = `https://www.google.com/maps?q=${ig.lat},${ig.lng}&layer=c&cbll=${ig.lat},${ig.lng}&output=svembed`
                            sv.style.cssText = 'width:100%;height:120px;border:0;display:block'
                            sv.setAttribute('allowfullscreen', '')
                            e.target.parentNode.appendChild(sv)
                          }} />
                      ) : (
                        <iframe
                          title={`streetview-${ig.id}`}
                          src={`https://www.google.com/maps?q=${ig.lat},${ig.lng}&layer=c&cbll=${ig.lat},${ig.lng}&output=svembed`}
                          style={{ width: '100%', height: '120px', border: 0, display: 'block' }}
                          allowFullScreen
                          loading="lazy"
                        />
                      )}
                    </div>
                    <div style={{ borderLeft: `3px solid ${isOutra ? corDen : cor}`, paddingLeft: 6 }}>
                      <p className="font-bold txt-1 text-sm leading-tight">{ig.nome}</p>
                      <p className="text-xs font-medium mt-0.5" style={{ color: isOutra ? corDen : cor }}>{ig.setor}</p>
                      {isOutra && (
                        <span className="inline-block text-[10px] font-bold px-1.5 py-0.5 rounded-md mt-1"
                          style={{ background: `${corDen}18`, color: corDen }}>{ig.denominacao}</span>
                      )}
                    </div>
                    <p className="text-xs txt-2 mt-1.5 leading-snug">{ig.endereco}</p>
                    <p className="text-xs txt-3 mt-1.5 flex items-center gap-1"><Clock size={9}/>{ig.culto}</p>
                    
                    {/* Visit status */}
                    <button onClick={() => toggleVisitado(ig.id)}
                      className="mt-2 flex items-center gap-1.5 px-2 py-1.5 rounded-lg text-xs font-semibold transition-all"
                      style={ig.visitado ? { background:'rgba(16,185,129,0.14)', color:'#34d399' } : { background:'var(--bg-raised)', color:'var(--text-secondary)' }}>
                      <CheckCircle size={11} className={ig.visitado ? 'text-green-600' : 'txt-3'} />
                      {ig.visitado ? 'Visitado' : 'Marcar como visitado'}
                    </button>
                    
                    {/* Priority */}
                    <div className="mt-2 flex items-center gap-1">
                      <Star size={9} className={ig.prioridade === 'alta' ? 'text-yellow-500' : ig.prioridade === 'baixa' ? 'txt-3' : 'text-blue-500'} />
                      <select value={ig.prioridade} onChange={e => setPrioridade(ig.id, e.target.value)}
                        className="text-xs font-semibold srf-soft border brd-soft rounded px-1.5 py-0.5">
                        <option value="baixa">Baixa</option>
                        <option value="media">Média</option>
                        <option value="alta">Alta</option>
                      </select>
                    </div>
                    
                    {/* Notes */}
                    <div className="mt-2">
                      <textarea
                        value={ig.nota || ''}
                        onChange={e => salvarNota(ig.id, e.target.value)}
                        placeholder="Adicionar anotação..."
                        className="w-full text-xs p-1.5 rounded-lg border brd-soft srf-soft resize-none"
                        rows={2}
                      />
                    </div>
                    
                    {(ig.pastor1 || ig.pastor2) && (
                      <div className="mt-2 pt-2 border-t brd-soft space-y-1">
                        {ig.pastor1 && (
                          <div>
                            <p className="text-xs font-semibold txt-2 flex items-center gap-1">
                              <User size={9} className="text-blue-500"/> {ig.pastor1}
                              {ig.esposa1 && <span className="font-normal txt-3">· {ig.esposa1}</span>}
                            </p>
                            <p className="text-xs txt-3 ml-3.5">1º Pastor</p>
                          </div>
                        )}
                        {ig.pastor2 && (
                          <div>
                            <p className="text-xs font-semibold txt-2 flex items-center gap-1">
                              <User size={9} className="text-purple-500"/> {ig.pastor2}
                              {ig.esposa2 && <span className="font-normal txt-3">· {ig.esposa2}</span>}
                            </p>
                            <p className="text-xs txt-3 ml-3.5">2º Pastor</p>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </Popup>
              </Marker>
            )
          })}

          {rota && (
            <Polyline positions={rota.linha}
              pathOptions={{ color: '#1d4ed8', weight: 4, opacity: 0.85 }} />
          )}
        </MapContainer>

        {/* Barra de progresso geocodificação */}
        {geoTotal > 0 && (
          <div className="absolute top-4 left-1/2 -translate-x-1/2 z-[1001] flex items-center gap-3 px-5 py-3 rounded-2xl"
            style={{ background: 'rgba(255,255,255,0.97)', boxShadow: '0 8px 32px rgba(29,78,216,0.18)', border: '1.5px solid #bfdbfe', minWidth: 280, backdropFilter: 'blur(12px)' }}>
            <div className="flex-1">
              <p className="font-bold mb-1.5" style={{ fontSize: 11, color: '#1d4ed8' }}>Calibrando posições... {geoProg}/{geoTotal}</p>
              <div className="w-full rounded-full overflow-hidden" style={{ height: 6, background: 'rgba(37,99,235,0.22)' }}>
                <div className="h-full rounded-full transition-all" style={{ width: `${Math.round(geoProg / geoTotal * 100)}%`, background: 'linear-gradient(90deg,#3b82f6,#2563eb)' }} />
              </div>
            </div>
            <span className="font-bold font-mono" style={{ fontSize: 12, color: '#2563eb' }}>{Math.round(geoProg / geoTotal * 100)}%</span>
          </div>
        )}

        {/* Controles do mapa */}
        <div className="absolute top-4 right-4 z-[1000] flex flex-col gap-2">
          <button onClick={() => setShowBairros(v => !v)}
            title={showBairros ? 'Ocultar bairros' : 'Mostrar bairros'}
            className="flex items-center gap-2 font-semibold px-4 py-2.5 rounded-2xl transition-all"
            style={{
              fontSize: 12,
              boxShadow: '0 4px 16px rgba(0,0,0,0.14)',
              backdropFilter: 'blur(12px)',
              background: showBairros ? 'rgba(5,150,105,0.92)' : 'rgba(20,26,42,0.92)',
              color: showBairros ? '#fff' : 'rgba(203,213,235,0.85)',
              border: showBairros ? '1.5px solid #059669' : '1.5px solid rgba(255,255,255,0.12)',
            }}>
            <Map size={13}/>
            {showBairros ? `Bairros ON (${bairrosGeo?.features?.length ?? 0})` : 'Bairros OFF'}
          </button>
          <button
            onClick={() => { localStorage.removeItem('geo_coords_igrejas'); window.location.reload() }}
            title="Recalibrar posições via endereço"
            className="flex items-center gap-2 font-semibold px-4 py-2.5 rounded-2xl transition-all justify-center"
            style={{
              fontSize: 11,
              boxShadow: '0 4px 16px rgba(0,0,0,0.10)',
              backdropFilter: 'blur(12px)',
              background: 'rgba(255,255,255,0.92)',
              color: 'rgba(203,213,235,0.60)',
              border: '1.5px solid rgba(255,255,255,0.12)',
            }}>
            <RotateCcw size={12}/> Recalibrar
          </button>
        </div>

        {/* Legenda de setores — colapsável */}
        {mostrarLegenda && (
          <div className="absolute bottom-4 right-4 z-[1000] rounded-2xl p-3 overflow-y-auto"
            style={{ maxHeight: 260, minWidth: 172, background: 'rgba(7,10,18,0.92)', boxShadow: '0 8px 32px rgba(0,0,0,0.5)', border: '1px solid rgba(255,255,255,0.10)', backdropFilter: 'blur(14px)' }}>
            <div className="flex items-center justify-between mb-2">
              <p className="font-bold txt-2" style={{ fontSize: 11 }}>Setores ({Object.keys(SETORES).length})</p>
              <button onClick={() => setMostrarLegenda(false)}
                className="p-1 rounded-lg transition-colors hover:bg-white/10"
                style={{ color: 'rgba(203,213,235,0.45)' }}>
                <X size={12}/>
              </button>
            </div>
            {Object.entries(SETORES).map(([setor, cor]) => (
              <div key={setor}
                className="flex items-center gap-2 mb-1 cursor-pointer rounded-lg px-1.5 py-0.5 transition-all hover:bg-white/5"
                style={{ background: filtroSetor === setor ? `${cor}18` : 'transparent' }}
                onClick={() => { setFiltroSetor(setor === filtroSetor ? 'Todos' : setor); setAba('igrejas') }}>
                <div className="rounded-full flex-shrink-0" style={{ width: 10, height: 10, backgroundColor: cor, boxShadow: `0 1px 4px ${cor}88` }} />
                <span className="whitespace-nowrap" style={{ fontSize: 11, color: filtroSetor === setor ? cor : 'rgba(203,213,235,0.80)', fontWeight: filtroSetor === setor ? 700 : 500 }}>{setor}</span>
              </div>
            ))}
          </div>
        )}
        {!mostrarLegenda && (
          <button onClick={() => setMostrarLegenda(true)}
            className="absolute bottom-4 right-4 z-[1000] flex items-center gap-1.5 rounded-xl px-2.5 py-2 transition-all hover:scale-105"
            style={{ background: 'rgba(7,10,18,0.88)', border: '1px solid rgba(255,255,255,0.10)', boxShadow: '0 4px 16px rgba(0,0,0,0.45)', color: 'rgba(203,213,235,0.85)', fontSize: 10, fontWeight: 600 }}>
            <Layers size={12}/> Legenda
          </button>
        )}

        {/* CSS dos labels de bairro */}
        <style>{`
          .leaflet-popup-content-wrapper {
            border-radius: 16px !important;
            box-shadow: 0 12px 40px rgba(0,0,0,0.18) !important;
            border: 1.5px solid rgba(255,255,255,0.07) !important;
            padding: 0 !important;
            overflow: hidden !important;
          }
          .leaflet-popup-content { margin: 0 !important; }
          .leaflet-popup-tip { display: none !important; }
        `}</style>
      </div>
    </div>
  )
}
