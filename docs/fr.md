# WeeWX

Amène votre station météo **WeeWX** dans Gladys, quelle que soit sa marque (Davis, Fine Offset /
Ecowitt, Oregon Scientific, La Crosse, WeatherFlow…) : température, humidité, pression, vent, pluie,
UV, rayonnement solaire et plus, tels que WeeWX les mesure.

> Développée sans le matériel : cette intégration a été testée contre WeeWX 5.4 et son pilote
> Simulator intégré, avec les vrais messages de weewx-mqtt, weewx-json et Belchertown, mais pas
> encore avec une vraie station. Vos retours sont les bienvenus sur le dépôt GitHub.

Cette intégration n'est pas affiliée au projet WeeWX.

## Présentation

[WeeWX](https://weewx.com) est le logiciel libre qui lit une station météo et archive ses mesures.
Cette intégration lit WeeWX depuis l'une de deux sources, ou les deux :

- **MQTT**, avec l'extension [weewx-mqtt](https://github.com/matthewwall/weewx-mqtt) : en direct,
  une mesure toutes les quelques secondes (recommandé) ;
- **HTTP**, le fichier JSON d'un skin WeeWX : [weewx-json](https://github.com/teeks99/weewx-json)
  (`weewx.json` ou `current_minimal.json`) ou
  [Belchertown](https://github.com/poblabs/weewx-belchertown) (`weewx_data.json`), que WeeWX
  réécrit à chaque rapport (toutes les 5 minutes par défaut).

Vous obtenez un appareil Gladys pour la station, quatre déclencheurs de scène, une action de scène
et un widget de tableau de bord. Tout est en lecture seule et reste sur votre réseau local : ni
compte, ni cloud.

Les systèmes d'unités US, METRIC et METRICWX de WeeWX sont tous pris en charge : Gladys reçoit des
°C, km/h, hPa et mm, et les convertit selon vos préférences quand il le peut.

## Prérequis

- Gladys 5.1 ou plus récent.
- WeeWX 4 ou 5, joignable par le réseau depuis Gladys.
- Pour MQTT : un broker MQTT (Mosquitto, ou celui de Gladys) et l'extension weewx-mqtt.
- Pour HTTP : un serveur web qui sert le dossier `public_html` de WeeWX, et le skin weewx-json ou
  Belchertown.

### Préparer weewx-mqtt

Installez l'extension, puis indiquez votre broker dans `weewx.conf` :

```ini
[StdRESTful]
    [[MQTT]]
        server_url = mqtt://utilisateur:motdepasse@192.0.2.10:1883/
        topic = weather
        unit_system = METRIC
        binding = archive, loop
        aggregation = aggregate
```

`binding = loop` envoie chaque paquet de boucle (toutes les 2 à 5 secondes selon la station),
`archive` chaque enregistrement d'archive. Gardez les deux pour des valeurs en direct et une pluie du
jour exacte. weewx-mqtt publie ses paquets JSON sur le `topic` suivi de `/loop` : ici
`weather/loop`.

### Préparer un skin JSON

Installez weewx-json (ou Belchertown) et notez l'adresse de son fichier, par exemple
`http://192.0.2.10/weewx/json/weewx.json` ou
`http://192.0.2.10/weewx/belchertown/json/weewx_data.json`. Ouvrez-la d'abord dans un navigateur :
vous devez voir du JSON, pas une page d'erreur.

## Configuration

Dans Gladys, ouvrez **Intégrations → WeeWX → Configuration** :

| Champ                                | Ce qu'il faut saisir                                                                               |
| ------------------------------------ | -------------------------------------------------------------------------------------------------- |
| Broker MQTT                          | `mqtt://adresse:1883` (ou `mqtts://` avec TLS). Vide : HTTP seulement.                             |
| Utilisateur / mot de passe MQTT      | Seulement si le broker les exige.                                                                  |
| Sujet MQTT                           | `weather/loop` par défaut : le `topic` de weewx-mqtt suivi de `/loop`. Les jokers sont acceptés.   |
| Adresse du fichier JSON              | L'adresse de `weewx.json`, `current_minimal.json` ou `weewx_data.json`. Vide : MQTT seulement.     |
| Intervalle de lecture du fichier (s) | 60 par défaut, 15 au minimum. WeeWX réécrit le fichier une fois par intervalle d'archive.          |
| Langue des textes                    | Noms des fonctionnalités (fixés à l'ajout de la station), phrase de scène et messages des actions. |

Enregistrez, puis cliquez sur **Vérifier les sources** : le bouton indique si le broker et le fichier
répondent et combien de valeurs WeeWX a envoyées en dernier. Dès qu'une première mesure est arrivée,
ouvrez l'onglet **Découverte** et ajoutez la station.

## L'appareil station

La station n'a que les fonctionnalités qu'elle mesure : une valeur que WeeWX n'a jamais envoyée
n'apparaît pas. Un capteur ajouté plus tard (un capteur UV, par exemple) apparaît dans l'onglet
Découverte, qui propose alors de mettre à jour l'appareil.

| Fonctionnalité              | Unité   | Source WeeWX                                                       |
| --------------------------- | ------- | ------------------------------------------------------------------ |
| Température                 | °C      | `outTemp`                                                          |
| Ressenti                    | °C      | `appTemp`, sinon l'indice de chaleur ou le refroidissement éolien  |
| Point de rosée              | °C      | `dewpoint`                                                         |
| Humidité                    | %       | `outHumidity`                                                      |
| Température intérieure      | °C      | `inTemp` (console)                                                 |
| Humidité intérieure         | %       | `inHumidity` (console)                                             |
| Pression (niveau de la mer) | hPa     | `barometer`                                                        |
| Pression (station)          | hPa     | `pressure` (MQTT seulement)                                        |
| Vent moyen / Rafales        | km/h    | `windSpeed`, `windGust`                                            |
| Direction du vent           | °       | `windDir`                                                          |
| Intensité de pluie          | mm/h    | `rainRate`                                                         |
| Pluie du jour               | mm      | `dayRain`, ou les paquets de boucle additionnés depuis minuit      |
| Il pleut                    | oui/non | intensité de pluie non nulle, ou pluie depuis la mesure précédente |
| Indice UV                   |         | `UV`                                                               |
| Rayonnement solaire (W/m²)  |         | `radiation`                                                        |
| Batterie faible             | oui/non | un `…BatteryStatus` différent de 0 (MQTT seulement)                |
| Dernière mesure             | min     | minutes depuis que l'intégration a reçu une nouvelle mesure        |

La fonctionnalité **Dernière mesure** compte selon l'horloge de Gladys, pas celle de WeeWX : une
horloge WeeWX en avance ou en retard n'a pas d'effet.

## Widget

**Station WeeWX** affiche les conditions actuelles : des tuiles en direct (température, humidité,
vent, pluie du jour, pression, celles que la station mesure), puis le ressenti, le vent avec sa
direction et ses rafales, la pluie, l'indice UV, la console intérieure et une batterie faible, et
depuis quand la dernière mesure est arrivée. Les valeurs suivent votre préférence métrique ou
impériale.

## Déclencheurs de scène

- **Il commence à pleuvoir** : la station mesure de la pluie après au moins 30 minutes sans. Une
  fois par épisode de pluie, quelles que soient les averses entre-temps. Variable : nom de la
  station.
- **La pluie s'arrête** : plus de pluie depuis la durée choisie (15, 30, 60 ou 120 minutes), après de
  la pluie. Une fois par accalmie. Variables : pluie du jour (mm), nom de la station.
- **Rafale de vent forte** : une rafale au-delà de la vitesse choisie (30 à 120 km/h), la première
  depuis 30 minutes. Variables : rafale (km/h), nom de la station.
- **Station muette** : aucune nouvelle mesure depuis la durée choisie (5 à 120 minutes) : WeeWX, la
  station ou le réseau est en panne. Une fois par silence. Variables : minutes sans mesure, nom de
  la station.

Après un redémarrage de l'intégration, la première mesure sert de référence : une pluie déjà en
cours ou un vent déjà fort ne déclenche rien.

## Action de scène

**Conditions actuelles** renvoie les dernières mesures en une phrase prête pour un message — par
exemple `12,4 °C, ressenti 10 °C, humidité 81 %, vent SO 15 km/h, rafales 32 km/h.` — et en
valeurs : température, humidité, vent moyen, rafales, pluie du jour, il pleut, minutes depuis la
mesure. La phrase suit la langue de la configuration.

## Exemples de scènes

- _Message du matin_ : à 7 h, **Conditions actuelles**, puis envoyer un message
  `Météo à la maison : {{summary}}`.
- _Rentrer le store_ : **Rafale de vent forte** au-delà de 50 km/h → fermer le store et envoyer un
  message avec la rafale.
- _Linge dehors_ : **Il commence à pleuvoir** → envoyer un message « rentre le linge ».
- _Arrosage_ : **La pluie s'arrête** depuis 120 minutes, avec la condition « Pluie du jour inférieure
  à 2 mm » → lancer l'arrosage.
- _Surveillance de la station_ : **Station muette** depuis 60 minutes → envoyer un message.

## Rafraîchissement et données

- MQTT : chaque paquet est lu dès son arrivée (à quelques secondes d'intervalle), mais les états
  partent vers Gladys au plus toutes les 15 secondes, et seulement ceux qui ont changé. Les
  déclencheurs voient chaque paquet.
- HTTP : le fichier est lu à l'intervalle choisi ; WeeWX le réécrit une fois par intervalle
  d'archive, les valeurs bougent donc toutes les 5 minutes environ.
- Une valeur qui ne change pas est renvoyée toutes les 6 heures, pour que Gladys ne l'affiche jamais
  comme périmée.
- Rien ne sort de votre réseau local.

## Dépannage

- **Pas de station dans l'onglet Découverte** : aucune mesure n'est encore arrivée. Cliquez sur
  **Vérifier les sources**.
- **« Le broker MQTT refuse la connexion »** : nom d'utilisateur ou mot de passe erroné.
- **« Le broker MQTT est injoignable »** : adresse ou port erronés, ou broker arrêté. Gladys fait
  tourner l'intégration dans un conteneur : `localhost` désigne le conteneur lui-même, utilisez
  plutôt l'adresse de la machine.
- **Connecté, mais « aucun message pour le moment »** : weewx-mqtt publie ailleurs. Vérifiez son
  `topic` (et le suffixe `/loop`) avec un client MQTT comme MQTT Explorer.
- **« Le fichier n'est pas dans un format WeeWX pris en charge »** : l'adresse désigne un autre
  fichier (une page HTML, le `day.json` de Belchertown…). Utilisez `weewx.json`,
  `current_minimal.json` ou `weewx_data.json`.
- **Pluie du jour absente en MQTT** : weewx-mqtt n'ajoute `dayRain` que si `augment_record` est
  activé (par défaut). Avec les seuls paquets de boucle et sans `dayRain`, l'intégration additionne
  elle-même la pluie à partir du minuit suivant.
- **Station muette se déclenche trop souvent en HTTP** : le fichier n'est réécrit qu'une fois par
  intervalle d'archive ; choisissez une durée bien supérieure (15 minutes ou plus pour l'intervalle
  de 5 minutes par défaut).
- **Journaux** : réglez `LOG_LEVEL=debug` sur le conteneur pour le détail de chaque cycle.

## Limites

- Une instance WeeWX, donc une station, par intégration.
- Les capteurs supplémentaires de WeeWX (`extraTemp1`, sol, feuille, foudre, qualité de l'air…) ne
  sont pas encore lus.
- Les fichiers weewx-json et Belchertown portent moins de valeurs que MQTT : ni pression de la
  station, ni batterie, et ni UV ni rayonnement avec weewx-json.
- Les sujets à valeur unique de weewx-mqtt (`weather/outTemp_C`…) sont ignorés : gardez
  l'agrégation `aggregate`.
- Développée et testée avec le pilote Simulator de WeeWX, pas avec une vraie station.
