#!/usr/bin/env python3
"""Create the initial ordered audit ledger from the currently bundled catalog."""

from __future__ import annotations

import argparse
import json
from pathlib import Path


AUDIT_DATE = "2026-10-26"
SEED_REVIEWS = {
    "BT": {
        "status": "source-review-started",
        "unitDefinition": "Official urban Thromde/municipality units; exact eligible classes and complete list still require verification.",
        "findings": [
            "The two existing WUP rows are Thimphu and Phuntsholing. Official Thromde material confirms municipal administration for Thimphu; the complete national list and the boundary between urban Thromdes and other local units are not yet established.",
            "Do not retain other WUP rows or add other Thromdes until the complete official classification is verified.",
        ],
        "sources": [
            {
                "publisher": "Thimphu Thromde",
                "url": "https://thimphucity.bt/about/",
                "evidence": "Official municipal authority describes Thimphu Thromde and its urban administrative scope.",
                "accessedAt": AUDIT_DATE,
            },
            {
                "publisher": "Election Commission of Bhutan",
                "url": "https://www.ecb.bt/issuance-of-the-final-electoral-roll-for-the-dzongkhag-thromdes-of-phentshogling-and-thimphu-for-the-thromde-elections-2026/",
                "evidence": "Official election material identifies Thimphu and Phuentsholing as Dzongkhag Thromdes; it is not a complete national city-unit register.",
                "accessedAt": AUDIT_DATE,
            },
        ],
    },
    "TL": {
        "status": "source-review-started",
        "unitDefinition": "Official city or explicitly urban city-municipality units only; district/municipality records are not assumed to be cities.",
        "findings": [
            "The existing WUP row is Dili. The Government portal describes Dili as the national capital and describes the district/municipality hierarchy, but the reviewed material does not establish a separate city-level administrative unit corresponding to the WUP row.",
            "Keep the Dili candidate in the source-gap queue until a city-level boundary or official city-unit classification is demonstrated.",
        ],
        "sources": [
            {
                "publisher": "Government of Timor-Leste",
                "url": "https://timor-leste.gov.tl/?p=91&lang=en",
                "evidence": "Official administrative-division page describes Dili as the capital and lists district/subdistrict structure; it does not by itself classify the WUP Dili entity as a city-level administrative unit.",
                "accessedAt": AUDIT_DATE,
            },
        ],
    },
    "CN": {
        "status": "verified-existing",
        "unitDefinition": "Four municipalities and prefecture-level cities from the reviewed Ministry of Civil Affairs snapshot.",
        "findings": [
            "Existing reviewed Mainland China source snapshot contains 297 eligible units: 4 municipalities and 293 prefecture-level cities.",
        ],
        "sources": [
            {
                "publisher": "Ministry of Civil Affairs of the People's Republic of China",
                "url": "https://dmfw.mca.gov.cn/XzqhVersionPublish.html",
                "evidence": "Reviewed local snapshot: tools/city-stamps/mainland-city-units.json, data cutoff 2025-12-31.",
                "accessedAt": AUDIT_DATE,
            },
        ],
    },
    "DK": {
        "status": "source-review-started",
        "unitDefinition": "Official city-level administrative units or city-type municipalities; general rural-inclusive municipalities and statistical urban settlements are not city-level units.",
        "findings": [
            "Statistics Denmark describes 98 municipalities as local administrative units and defines urban areas separately as built-up/statistical areas. This supports excluding municipality-wide rural-inclusive areas as city records.",
            "The five existing WUP rows still need an explicit candidate disposition in the audit before the area can be marked complete.",
        ],
        "sources": [
            {
                "publisher": "Statistics Denmark",
                "url": "https://www.dst.dk/da/Statistik/dokumentation/nomenklaturer/nuts",
                "evidence": "Official statistical nomenclature describes the 2007 local-government reform and 98 municipalities.",
                "accessedAt": AUDIT_DATE,
            },
            {
                "publisher": "Statistics Denmark",
                "url": "https://www.dst.dk/en/Statistik/dokumentation/documentationofstatistics/urban-areas/statistical-presentation",
                "evidence": "Official statistical presentation treats urban areas as a separate statistical classification, not municipal administrative units.",
                "accessedAt": AUDIT_DATE,
            },
        ],
    },
    "UA": {
        "status": "source-review-started",
        "unitDefinition": "Officially coded settlement category 'city'; exclude urban-type settlements, villages, and city districts.",
        "findings": [
            "The State Statistics Service identifies the official KATOTTG codifier as the source of administrative-territorial units and settlements, with a fourth-level category explicitly including cities, urban-type settlements, villages, and settlements. The complete current source snapshot and city-only extraction have not yet been checked into the project.",
            "Use the codifier's persistent system number as the stable source identity; do not infer inclusion from the WUP name.",
        ],
        "sources": [
            {
                "publisher": "State Statistics Service of Ukraine",
                "url": "https://stat.gov.ua/en/node/7413",
                "evidence": "Official catalog description gives the KATOTTG hierarchy, explicitly lists cities as a settlement category, and describes persistent unique system numbers.",
                "accessedAt": AUDIT_DATE,
            },
            {
                "publisher": "Ministry for Communities and Territories Development of Ukraine",
                "url": "https://mindev.gov.ua/diialnist/rozvytok-mistsevoho-samovriaduvannia/kodyfikator-administratyvno-terytorialnykh-odynyts-ta-terytorii-terytorialnykh-hromad",
                "evidence": "Official ministry source linked by the State Statistics Service as the maintained codifier.",
                "accessedAt": AUDIT_DATE,
            },
        ],
    },
    "UZ": {
        "status": "source-review-started",
        "unitDefinition": "Officially classified city units only; districts and lower-level populated entities must be excluded.",
        "findings": [
            "The National Statistics Committee publishes an official city classifier, but the discovered table includes district rows as well. The precise category field, complete city-only roster, stable codes, and WUP crosswalk still require review.",
        ],
        "sources": [
            {
                "publisher": "National Statistics Committee of the Republic of Uzbekistan",
                "url": "https://api.siat.stat.uz/media/uploads/sdmx/sdmx_data_290.pdf",
                "evidence": "Official statistical classifier titled Cities; its contents also include district labels, so the title alone is insufficient for inclusion.",
                "accessedAt": AUDIT_DATE,
            },
        ],
    },
    "UG": {
        "status": "source-review-started",
        "unitDefinition": "Officially designated city local governments; exclude districts and lower-level urban/rural localities.",
        "findings": [
            "The 2024 census source states that Uganda had 135 districts and 11 cities at census time. The complete city roster and the 67 legacy WUP candidate dispositions still need to be assembled from the official census/admin source.",
        ],
        "sources": [
            {
                "publisher": "Uganda Bureau of Statistics",
                "url": "https://www.ubos.org/wp-content/uploads/2025/06/Bugisu-Sub-Region-Census-2024-Profile-Report.pdf",
                "evidence": "Official 2024 census profile states the country had 135 districts and 11 cities at census time.",
                "accessedAt": AUDIT_DATE,
            },
        ],
    },
    "UY": {
        "status": "source-review-started",
        "unitDefinition": "Official city-level administrative units or city-type municipalities; statistical localities and broad municipal jurisdictions must be distinguished.",
        "findings": [
            "Government sources provide a geographic address model with locality codes and a map/list of municipalities, but these sources do not yet establish that every locality or municipality is a city-type administrative unit.",
            "The seven legacy WUP candidates require a category and parent-jurisdiction crosswalk before inclusion or exclusion.",
        ],
        "sources": [
            {
                "publisher": "National Directorate of Taxation, Uruguay",
                "url": "https://www.gub.uy/direccion-general-impositiva/sites/direccion-general-impositiva/files/documentos/publicaciones/Codigos%20de%20Departamento%20y%20Localidad.pdf",
                "evidence": "Official department and locality code list; locality codes alone do not prove city-level administrative status.",
                "accessedAt": AUDIT_DATE,
            },
            {
                "publisher": "Office of Planning and Budget, Uruguay",
                "url": "https://www.opp.gub.uy/sites/default/files/inline-files/Mapa%20Municipios_2020.pdf",
                "evidence": "Official municipality map/list; rural-inclusive scope and city-type eligibility require further review.",
                "accessedAt": AUDIT_DATE,
            },
        ],
    },
    "TD": {
        "status": "source-discovery-gap",
        "unitDefinition": None,
        "findings": [
            "Initial French- and English-language searches did not surface a usable government city-level roster or administrative city classification. This is a source-discovery gap, not evidence that no such source exists.",
            "The 66 existing WUP candidates remain unverified and must not be treated as official cities.",
        ],
        "sources": [],
    },
    "YE": {
        "status": "source-review-started",
        "unitDefinition": "Official city-level administrative units or city-type municipalities; district-level local government is not assumed to be an urban city unit.",
        "findings": [
            "The reviewed official legal portal describes local councils and administrative districts, but the source does not establish a separate city-level unit corresponding to the existing WUP candidates.",
            "The 191 legacy candidates require a current, usable official roster and unit-category crosswalk; no WUP row is accepted from its name or settlement status alone.",
        ],
        "sources": [
            {
                "publisher": "Yemen legal information portal",
                "url": "https://agoye.gov.ye/page.php?id=395&lng=arabic",
                "evidence": "Official legal material describes local authority and district councils; it does not establish the WUP settlement records as city-level administrative units.",
                "accessedAt": AUDIT_DATE,
            },
        ],
    },
    "AM": {
        "status": "source-review-started",
        "unitDefinition": "Officially classified city-level administrative or urban municipal units; rural communities and lower-level localities are excluded.",
        "findings": [
            "Armstat publishes current marz/Yerevan and urban/rural community statistics, but the located pages do not provide the complete legal city-status roster, stable unit identifiers, and a WUP candidate crosswalk.",
            "The three legacy WUP candidates remain unverified pending a source that distinguishes city-status localities from communities and other settlements.",
        ],
        "sources": [
            {
                "publisher": "Statistical Committee of the Republic of Armenia",
                "url": "https://armstat.am/file/article/marzer_2025_4.pdf",
                "evidence": "Official 2025 population publication for marzes and Yerevan; requires further extraction and legal-category cross-check.",
                "accessedAt": AUDIT_DATE,
            },
            {
                "publisher": "Statistical Committee of the Republic of Armenia",
                "url": "https://armstat.am/file/article/sv_12_25e_510.pdf",
                "evidence": "Official statistical report distinguishes urban and rural communities; this alone does not provide the city-level administrative roster.",
                "accessedAt": AUDIT_DATE,
            },
        ],
    },
    "IL": {
        "status": "source-review-started",
        "unitDefinition": "Official locality categories and municipal status; include only city-level municipal/locality types supported by an official code.",
        "findings": [
            "The Central Bureau of Statistics publishes locality lists with locality type and locality code and separate municipal-status tables. The discovered snapshots are dated 2017/2019; a current roster and a precise municipality-versus-locality inclusion rule are still required.",
            "The 38 legacy WUP rows have not yet been cross-matched to current official locality codes and municipal categories.",
        ],
        "sources": [
            {
                "publisher": "Israel Central Bureau of Statistics",
                "url": "https://www.cbs.gov.il/he/publications/doclib/2019/households17_1755/list_e.pdf",
                "evidence": "Official locality list by size/type includes locality codes; publication is historical and requires a current refresh.",
                "accessedAt": AUDIT_DATE,
            },
            {
                "publisher": "Israel Central Bureau of Statistics",
                "url": "https://www.cbs.gov.il/he/publications/doclib/2017/socio_eco13_1694/t07.pdf",
                "evidence": "Official table includes municipal status and locality type/code; publication is historical and requires current verification.",
                "accessedAt": AUDIT_DATE,
            },
        ],
    },
    "CN-TW": {
        "status": "source-review-started",
        "unitDefinition": "The official city/municipality classes recognized by local administrative law; exclude ordinary townships, districts, and populated places.",
        "findings": [
            "The existing 27 WUP rows include names explicitly classified as townships, towns, districts, stations, or raw populated-place labels; WUP status does not establish city-level administrative status.",
            "The official legal overview confirms distinct municipalities/cities and county-administered cities, but a complete current unit list with stable administrative codes and name evidence has not yet been assembled.",
        ],
        "sources": [
            {
                "publisher": "Ministry of the Interior, Taiwan",
                "url": "https://www.moi.gov.tw/cp.aspx?n=674",
                "evidence": "Official overview states the hierarchy includes municipalities, cities, counties, and county-administered cities and reports their unit counts; a complete city-unit roster is still required.",
                "accessedAt": AUDIT_DATE,
            },
            {
                "publisher": "Office of the President, Republic of China (Taiwan)",
                "url": "https://english.president.gov.tw/Page/106",
                "evidence": "Official page describes the local-government hierarchy and identifies the six special municipalities and three provincial cities; it does not enumerate county-administered cities.",
                "accessedAt": AUDIT_DATE,
            },
            {
                "publisher": "Ministry of the Interior, Taiwan, Laws and Regulations",
                "url": "https://glrs.moi.gov.tw/LawContent.aspx?id=FL001120",
                "evidence": "Local Government Act distinguishes provinces, special municipalities, counties, cities, townships, towns, and county-administered cities.",
                "accessedAt": AUDIT_DATE,
            },
        ],
    },
    "CN-MO": {
        "status": "scope-exception-currently-conforms",
        "unitDefinition": "Keep Macau as one product region; do not expand its seven parishes into city records.",
        "findings": [
            "The existing single Macau record matches the approved product scope. The official source describes the Macau SAR territory and its seven parishes; the parishes are not expanded into city entries.",
        ],
        "sources": [
            {
                "publisher": "Cartography and Cadastre Bureau, Macao SAR Government",
                "url": "https://www.dscc.gov.mo/zh-hant/geographical_location.html",
                "evidence": "Official geographic page describes the Macau SAR territory and its seven parishes.",
                "accessedAt": AUDIT_DATE,
            },
        ],
    },
    "CN-HK": {
        "status": "scope-exception-pending-rebuild",
        "unitDefinition": "Keep Hong Kong as one product region; do not expand its districts or urban places into city records.",
        "findings": [
            "The existing six WUP rows include multiple district/urban-place records. The approved product scope is one Hong Kong region unit, so these rows must be consolidated to one verified regional entry during data reconstruction.",
        ],
        "sources": [
            {
                "publisher": "Home Affairs Department, Hong Kong SAR Government",
                "url": "https://www.had.gov.hk/en/18_districts/my_map.htm",
                "evidence": "Official page enumerates the 18 districts; the audit follows the approved single-region product scope rather than treating districts as cities.",
                "accessedAt": AUDIT_DATE,
            },
        ],
    },
    "CF": {
        "status": "source-review-started",
        "unitDefinition": "Official city-level administrative units or urban-type local municipalities; general rural-inclusive communes and quartiers are not presumed to qualify.",
        "findings": [
            "The Government portal describes 7 regions, 16 prefectures, 72 subprefectures, 175 communes, and more than 8,500 villages/quartiers, and names principal cities. It does not classify those city names as a distinct administrative city/municipality level or provide stable unit codes.",
            "The 18 existing WUP candidates therefore remain unverified until their exact government unit/category and identity are matched.",
        ],
        "sources": [
            {
                "publisher": "Government of the Central African Republic",
                "url": "https://gouv.cf/node/56",
                "evidence": "Official portal gives the administrative hierarchy and a list of principal cities, but does not establish a city-level administrative category or stable city IDs.",
                "accessedAt": AUDIT_DATE,
            },
        ],
    },
    "IQ": {
        "status": "source-review-started",
        "unitDefinition": "Official city-level administrative units or city-type municipalities; governorates, districts, subdistricts, and urban census areas are distinct categories.",
        "findings": [
            "The official statistics office publishes population estimates by governorate, district, and subdistrict, while the 2024 census questionnaire separately records urban/rural status. Neither source by itself classifies the existing 140 WUP candidates as city-level administrative units.",
            "A current official city/municipality roster and stable unit IDs remain missing.",
        ],
        "sources": [
            {
                "publisher": "Central Statistical Organization, Iraq",
                "url": "https://cosit.gov.iq/documents/population/projection/%D8%AA%D8%B1%D9%83%D9%8A%D8%A8%D8%A9%20%D8%B3%D9%83%D8%A7%D9%86%D9%8A%D8%A9.pdf",
                "evidence": "Official 2023 population estimates are organized by administrative governorate, district, and subdistrict, not a city class.",
                "accessedAt": AUDIT_DATE,
            },
            {
                "publisher": "Central Statistical Organization, Iraq",
                "url": "https://cosit.gov.iq/images/census2024/Enumeration%20Questionnaire%20English%20copy.pdf",
                "evidence": "Official 2024 census form records urban/rural status separately from governorate, district, and nahya; urban status alone is not city administration.",
                "accessedAt": AUDIT_DATE,
            },
        ],
    },
    "IR": {
        "status": "source-discovery-gap",
        "unitDefinition": None,
        "findings": [
            "Initial official-source searches did not locate a usable current city-level administrative roster with stable IDs and clear distinction from counties/districts. Search results that list cities are non-official and are not accepted as evidence.",
            "The 259 existing WUP rows remain unverified; this status records a source gap, not that no official source exists.",
        ],
        "sources": [],
    },
    "BZ": {
        "status": "source-review-started",
        "unitDefinition": "Official city councils/city municipalities; town councils require separate category review and are not included merely because they are municipalities.",
        "findings": [
            "Belize's Ministry responsible for local government identifies distinct City Council Acts for Belize City and Belmopan and a separate Town Council Act. This supports a city-versus-town legal distinction; complete current city-unit roster, stable identifiers, and the single legacy WUP crosswalk remain to be recorded.",
        ],
        "sources": [
            {
                "publisher": "Ministry of Rural Transformation, Community Development, Labour and Local Government, Belize",
                "url": "https://www.ruraltransformation.gov.bz/the-ministry/local-government/belize-mayors-association/",
                "evidence": "Official ministry page distinguishes town and city councils and names the separate Belize City Council Act, Belmopan City Council Act, and Town Council Act.",
                "accessedAt": AUDIT_DATE,
            },
            {
                "publisher": "Ministry of Local Government, Belize",
                "url": "https://mlgrd.gov.bz/the-ministry/local-government/laws/",
                "evidence": "Official local-government laws index lists the Belize City Council and Belmopan City Council Acts.",
                "accessedAt": AUDIT_DATE,
            },
        ],
    },
    "CV": {
        "status": "source-review-started",
        "unitDefinition": "Official city-status localities or explicitly urban municipal units; municipality-wide territories and statistical localities are not assumed to be cities.",
        "findings": [
            "The National Statistics Institute's 2021 census material documents 22 administrative Concelhos and labels Praia as the capital city, but the reviewed pages do not provide a complete legal city-status roster or stable city IDs.",
            "The two legacy WUP candidates require city-status and parent-municipality verification.",
        ],
        "sources": [
            {
                "publisher": "National Statistics Institute of Cabo Verde",
                "url": "https://ine.cv/wp-content/uploads/2022/11/cabo-verde.pdf",
                "evidence": "Official 2021 census publication documents 22 Concelhos and identifies Praia as the capital city; it is not a complete city-status list.",
                "accessedAt": AUDIT_DATE,
            },
        ],
    },
    "RU": {
        "status": "source-review-started",
        "unitDefinition": "Officially classified city settlements with stable administrative-territorial codes; exclude urban-type settlements, villages, and municipal territories that are not cities.",
        "findings": [
            "Rosstat maintains official OKATO and OKTMO classifiers with current amendments. The classifier files need to be obtained and parsed to isolate settlement type 'city', confirm current names/codes, and crosswalk the 310 legacy WUP candidates.",
        ],
        "sources": [
            {
                "publisher": "Federal State Statistics Service (Rosstat), Russian Federation",
                "url": "https://rosstat.gov.ru/classification",
                "evidence": "Official page lists current OKATO and OKTMO administrative/municipal territorial classifiers and their updates.",
                "accessedAt": AUDIT_DATE,
            },
        ],
    },
    "BG": {
        "status": "source-review-started",
        "unitDefinition": "Officially classified towns/cities with settlement codes; exclude villages, mayoralties, municipalities, and city districts.",
        "findings": [
            "The National Statistical Institute publishes a 2025 administrative-territorial and territorial division with separate municipality, town, and village categories and EKKATTE codes. The city/town class can be audited from this source, but the complete row extraction and 18-candidate WUP crosswalk have not yet been recorded.",
        ],
        "sources": [
            {
                "publisher": "National Statistical Institute of Bulgaria",
                "url": "https://www.nsi.bg/en/statistical-data/46/1333",
                "evidence": "Official 2025 data distinguishes municipalities, towns, and villages and publishes EKKATTE identifiers.",
                "accessedAt": AUDIT_DATE,
            },
            {
                "publisher": "National Statistical Institute of Bulgaria",
                "url": "https://www.nsi.bg/en/file/35537/ATTD_RB_2025.pdf",
                "evidence": "Official 2025 administrative-territorial publication with settlement and administrative-code tables.",
                "accessedAt": AUDIT_DATE,
            },
        ],
    },
    "HR": {
        "status": "source-review-started",
        "unitDefinition": "Official city-level local self-government units (grad); distinguish cities from municipalities and settlements.",
        "findings": [
            "The Croatian Bureau of Statistics' Spatial Statistical Register contains cities/municipalities and settlements as distinct spatial-unit classes. A current official roster, stable IDs, and the six legacy WUP candidate mappings remain to be checked.",
        ],
        "sources": [
            {
                "publisher": "Croatian Bureau of Statistics",
                "url": "https://web.dzs.hr/Eng/international/Quality_Report/Quality_Report_Results/Quality%20Report%20_Spatial%20Register%202018%20EN.pdf",
                "evidence": "Official register documentation distinguishes counties, cities/municipalities, and settlements; current snapshot extraction is pending.",
                "accessedAt": AUDIT_DATE,
            },
        ],
    },
    "GM": {
        "status": "source-review-started",
        "unitDefinition": "Official city or city-type municipal local-government authorities; regional area councils and districts are not presumed to be cities.",
        "findings": [
            "The Government of The Gambia lists Banjul City Council and Kanifing Municipal Council separately from regional area councils. The full statutory city/municipality classification, stable identifiers, and seven WUP candidate dispositions remain to be documented.",
        ],
        "sources": [
            {
                "publisher": "Government of The Gambia",
                "url": "https://gambia.gov.gm/gambia-app/our-ministries-3/local-government-areas/",
                "evidence": "Official local-government directory distinguishes Banjul City Council, Kanifing Municipal Council, and regional Area Councils.",
                "accessedAt": AUDIT_DATE,
            },
        ],
    },
    "IS": {
        "status": "source-review-started",
        "unitDefinition": "Officially designated city-type municipality or city unit; general rural-inclusive municipalities and statistical urban nuclei must be distinguished.",
        "findings": [
            "Statistics Iceland distinguishes municipal jurisdictions from urban nuclei/localities and identifies Reykjavík as a municipality and the largest urban locality. Current legal category, city-level eligibility, stable code, and the single WUP crosswalk remain to be verified.",
        ],
        "sources": [
            {
                "publisher": "Statistics Iceland",
                "url": "https://www.statice.is/publications/news-archive/inhabitants/the-population-on-1-january-2024/",
                "evidence": "Official population release lists municipalities and identifies Reykjavík as the most populous municipality.",
                "accessedAt": AUDIT_DATE,
            },
            {
                "publisher": "Statistics Iceland",
                "url": "https://statice.is/publications/news-archive/inhabitants/population-by-urban-nuclei-2001-2020/",
                "evidence": "Official statistical series treats urban nuclei/localities as a separate statistical geography.",
                "accessedAt": AUDIT_DATE,
            },
        ],
    },
    "GN": {
        "status": "source-review-started",
        "unitDefinition": "Official urban communes/local governments only; rural communes, subprefectures, and prefectures are excluded.",
        "findings": [
            "The National Statistics Institute's administrative definitions distinguish urban communes from rural communes and identify the urban commune as a local administrative body. Available official definitions/statistics found so far are dated 2014–2016; a current list, stable codes, and the 38 legacy WUP candidate crosswalk remain to be verified.",
        ],
        "sources": [
            {
                "publisher": "National Institute of Statistics, Guinea",
                "url": "https://www.stat-guinee.org/images/Documents/Publications/INS/annuelles/annuaire/INS_annuaire_2016.pdf",
                "evidence": "Official statistical yearbook defines urban and rural communes separately and describes the urban commune's municipal administration.",
                "accessedAt": AUDIT_DATE,
            },
            {
                "publisher": "National Institute of Statistics, Guinea",
                "url": "https://www.stat-guinee.org/index.php?option=com_content&view=article&id=271&catid=2",
                "evidence": "Official statistical site provides a prefecture/subprefecture/commune list; current urban/rural class linkage is still needed.",
                "accessedAt": AUDIT_DATE,
            },
        ],
    },
    "GW": {
        "status": "source-review-started",
        "unitDefinition": "Officially designated city or urban municipal unit; regions/sectors and rural localities are not assumed to be cities.",
        "findings": [
            "The National Statistics Institute publishes an official statistical yearbook describing regional and sector-level administration, but the reviewed source does not establish a city-level administrative category or stable city roster. Four WUP candidates remain unverified.",
        ],
        "sources": [
            {
                "publisher": "National Institute of Statistics of Guinea-Bissau",
                "url": "https://www.stat-guinebissau.com/Menu_principal/Pubica%C3%A7%C3%B5es/anuario/boletim_estatistico_GB/guinebissau-em-numero2017.pdf",
                "evidence": "Official statistical bulletin provides regional administrative data; no city-level category is established by the reviewed material.",
                "accessedAt": AUDIT_DATE,
            },
        ],
    },
    "CG": {
        "status": "source-review-started",
        "unitDefinition": "Official city-level or urban municipal administrative units; departments and statistical urban areas alone are insufficient.",
        "findings": [
            "The National Institute of Statistics has published the 2023/2024 population census preliminary report, but the source surfaced so far reports departments and population concentration rather than a complete city/municipal legal roster. Twelve WUP candidates remain unverified.",
        ],
        "sources": [
            {
                "publisher": "National Institute of Statistics, Republic of the Congo",
                "url": "https://ins-congo.cg/rapport-preliminaire/",
                "evidence": "Official census preliminary report identifies departments and urban population distribution; a city-level administrative roster is still required.",
                "accessedAt": AUDIT_DATE,
            },
        ],
    },
    "CD": {
        "status": "source-discovery-gap",
        "unitDefinition": None,
        "findings": [
            "Initial searches surfaced legal gazette copies on a non-government host describing cities and communes as administrative levels, but no usable official government-hosted roster with stable codes was located. The re-hosted legal text is not accepted as the production source under the current source/permission rules.",
            "The 445 legacy WUP candidates remain unverified; this is a source-hosting gap, not evidence that no official source exists.",
        ],
        "sources": [],
    },
    "LY": {
        "status": "source-review-started",
        "unitDefinition": "Official city-level administrative units or city-type urban municipalities; municipality-wide rural-inclusive jurisdictions are not presumed to be cities.",
        "findings": [
            "The Ministry of Local Government publishes a municipality list and states municipalities are local-administration units. The source does not distinguish city-type units from broader municipal jurisdictions; 15 WUP candidates remain unverified.",
        ],
        "sources": [
            {
                "publisher": "Ministry of Local Government, State of Libya",
                "url": "https://www.lgm.gov.ly/municipalities",
                "evidence": "Official ministry list of municipalities and statement that municipalities are local administration units; city-type eligibility is not specified.",
                "accessedAt": AUDIT_DATE,
            },
        ],
    },
    "LR": {
        "status": "source-review-started",
        "unitDefinition": "Official city-level administrative units or city-type municipalities; census-defined urban areas are not equivalent to city administrations.",
        "findings": [
            "The Liberia Institute of Statistics defines urban areas by population (2,000+) and county-capital exceptions. This is a statistical urban definition, not a legal city/municipality roster; 13 WUP candidates remain unverified.",
        ],
        "sources": [
            {
                "publisher": "Liberia Institute of Statistics and Geo-Information Services",
                "url": "https://lisgis.gov.lr/censusreport/thematic/ThematicReportonMigrationUrbanization.pdf",
                "evidence": "Official 2022 census report defines statistical urban areas; it does not establish city-level administrative status.",
                "accessedAt": AUDIT_DATE,
            },
        ],
    },
}


def build_ledger(catalog_path: Path) -> dict:
    catalog = json.loads(catalog_path.read_text(encoding="utf-8"))
    counts: dict[str, dict[str, int]] = {}
    for city in catalog["cities"]:
        area_counts = counts.setdefault(city["areaId"], {"records": 0, "wupRecords": 0})
        area_counts["records"] += 1
        if city["id"].startswith("wup-"):
            area_counts["wupRecords"] += 1

    areas = []
    for order, area in enumerate(catalog["areas"], start=1):
        counts_for_area = counts.get(area["id"], {"records": 0, "wupRecords": 0})
        review = SEED_REVIEWS.get(
            area["id"],
            {
                "status": "not-started",
                "unitDefinition": None,
                "findings": [
                    "Official city-level administrative classification and complete source roster have not yet been reviewed.",
                ],
                "sources": [],
            },
        )
        areas.append(
            {
                "order": order,
                "areaId": area["id"],
                "areaNameZh": area["nameZh"],
                "areaNameEn": area["nameEn"],
                "previousCatalogRecords": counts_for_area["records"],
                "previousWupRecords": counts_for_area["wupRecords"],
                "auditStatus": review["status"],
                "unitDefinition": review["unitDefinition"],
                "findings": review["findings"],
                "sources": review["sources"],
                "eligibleUnitCount": 297 if area["id"] == "CN" else None,
                "productScopeUnitCount": (
                    1 if area["id"] in {"CN-MO", "CN-HK"} else None
                ),
                "sourceGaps": (
                    ["Complete official city-unit roster and stable identifiers."]
                    if area["id"] == "CN-TW"
                    else (
                        ["Complete official urban Thromde classification and roster."]
                        if area["id"] == "BT"
                        else (
                            ["Evidence that the Dili candidate is a city-level administrative unit."]
                            if area["id"] == "TL"
                            else (
                                ["Select and document the single Hong Kong regional entry during reconstruction."]
                                if area["id"] == "CN-HK"
                                else (
                                    []
                                    if area["id"] in {"CN", "CN-MO"}
                                    else ["Official classification, complete roster, stable IDs, and name sources."]
                                )
                            )
                        )
                    )
                ),
            }
        )

    return {
        "schemaVersion": 1,
        "auditDate": AUDIT_DATE,
        "basis": "Existing cityStampCatalogAreas order and bundled city-stamp-catalog.json; prior WUP rows are discovery candidates only, not proof of administrative city status.",
        "policy": "Publish only units whose official city-level administrative category and stable identity are evidenced. Do not infer status from name suffixes or WUP/GeoNames/OSM populated-place classes.",
        "areas": areas,
    }


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--catalog",
        type=Path,
        default=Path("src/data/city-stamp-catalog.json"),
    )
    parser.add_argument(
        "--output",
        type=Path,
        default=Path("tools/city-stamps/area-audit.json"),
    )
    parser.add_argument("--force", action="store_true")
    args = parser.parse_args()

    if args.output.exists() and not args.force:
        parser.error(f"{args.output} already exists; refusing to overwrite audit work without --force")
    ledger = build_ledger(args.catalog)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(
        json.dumps(ledger, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    started = sum(area["auditStatus"] != "not-started" for area in ledger["areas"])
    print(f"Wrote ordered audit ledger for {len(ledger['areas'])} areas; {started} have a seeded review")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
