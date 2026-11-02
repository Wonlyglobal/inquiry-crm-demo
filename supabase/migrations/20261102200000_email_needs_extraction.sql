begin;
do $$begin
 if to_regprocedure('private.parse_email_needs(text,text)') is not null or to_regprocedure('public.extract_inquiry_email_needs(uuid,boolean)') is not null then raise exception '需求提取对象已存在，请先核对来源';end if;
 if (select md5(prosrc) from pg_proc where oid='public.convert_email_intakes_to_inquiries(uuid[])'::regprocedure) is distinct from 'd1371ee125fe7f49a1df96eba8e451ea' or (select md5(prosrc) from pg_proc where oid='private.capture_pipeline_feishu()'::regprocedure) is distinct from '021b8b71c0b79f82c528daf7d23ab502' then raise exception '原转换或飞书函数发生漂移，请先核对';end if;
end$$;

create function private.email_need_countries() returns table(code text,name text,alias text) language sql immutable set search_path='' as $$
 values
 ('AD','Andorra','ad'),
 ('AD','Andorra','andorra'),
 ('AD','Andorra','安道尔'),
 ('AE','United Arab Emirates','ae'),
 ('AE','United Arab Emirates','united arab emirates'),
 ('AE','United Arab Emirates','阿拉伯联合酋长国'),
 ('AF','Afghanistan','af'),
 ('AF','Afghanistan','afghanistan'),
 ('AF','Afghanistan','阿富汗'),
 ('AG','Antigua & Barbuda','ag'),
 ('AG','Antigua & Barbuda','antigua & barbuda'),
 ('AG','Antigua & Barbuda','安提瓜和巴布达'),
 ('AI','Anguilla','ai'),
 ('AI','Anguilla','anguilla'),
 ('AI','Anguilla','安圭拉'),
 ('AL','Albania','al'),
 ('AL','Albania','albania'),
 ('AL','Albania','阿尔巴尼亚'),
 ('AM','Armenia','am'),
 ('AM','Armenia','armenia'),
 ('AM','Armenia','亚美尼亚'),
 ('AO','Angola','ao'),
 ('AO','Angola','angola'),
 ('AO','Angola','安哥拉'),
 ('AQ','Antarctica','aq'),
 ('AQ','Antarctica','antarctica'),
 ('AQ','Antarctica','南极洲'),
 ('AR','Argentina','ar'),
 ('AR','Argentina','argentina'),
 ('AR','Argentina','阿根廷'),
 ('AS','American Samoa','as'),
 ('AS','American Samoa','american samoa'),
 ('AS','American Samoa','美属萨摩亚'),
 ('AT','Austria','at'),
 ('AT','Austria','austria'),
 ('AT','Austria','奥地利'),
 ('AU','Australia','au'),
 ('AU','Australia','australia'),
 ('AU','Australia','澳大利亚'),
 ('AW','Aruba','aw'),
 ('AW','Aruba','aruba'),
 ('AW','Aruba','阿鲁巴'),
 ('AX','Åland Islands','ax'),
 ('AX','Åland Islands','åland islands'),
 ('AX','Åland Islands','奥兰群岛'),
 ('AZ','Azerbaijan','az'),
 ('AZ','Azerbaijan','azerbaijan'),
 ('AZ','Azerbaijan','阿塞拜疆'),
 ('BA','Bosnia & Herzegovina','ba'),
 ('BA','Bosnia & Herzegovina','bosnia & herzegovina'),
 ('BA','Bosnia & Herzegovina','波斯尼亚和黑塞哥维那'),
 ('BB','Barbados','bb'),
 ('BB','Barbados','barbados'),
 ('BB','Barbados','巴巴多斯'),
 ('BD','Bangladesh','bd'),
 ('BD','Bangladesh','bangladesh'),
 ('BD','Bangladesh','孟加拉国'),
 ('BE','Belgium','be'),
 ('BE','Belgium','belgium'),
 ('BE','Belgium','比利时'),
 ('BF','Burkina Faso','bf'),
 ('BF','Burkina Faso','burkina faso'),
 ('BF','Burkina Faso','布基纳法索'),
 ('BG','Bulgaria','bg'),
 ('BG','Bulgaria','bulgaria'),
 ('BG','Bulgaria','保加利亚'),
 ('BH','Bahrain','bh'),
 ('BH','Bahrain','bahrain'),
 ('BH','Bahrain','巴林'),
 ('BI','Burundi','bi'),
 ('BI','Burundi','burundi'),
 ('BI','Burundi','布隆迪'),
 ('BJ','Benin','bj'),
 ('BJ','Benin','benin'),
 ('BJ','Benin','贝宁'),
 ('BL','St. Barthélemy','bl'),
 ('BL','St. Barthélemy','st. barthélemy'),
 ('BL','St. Barthélemy','圣巴泰勒米'),
 ('BM','Bermuda','bm'),
 ('BM','Bermuda','bermuda'),
 ('BM','Bermuda','百慕大'),
 ('BN','Brunei','bn'),
 ('BN','Brunei','brunei'),
 ('BN','Brunei','文莱'),
 ('BO','Bolivia','bo'),
 ('BO','Bolivia','bolivia'),
 ('BO','Bolivia','玻利维亚'),
 ('BQ','Caribbean Netherlands','bq'),
 ('BQ','Caribbean Netherlands','caribbean netherlands'),
 ('BQ','Caribbean Netherlands','荷属加勒比区'),
 ('BR','Brazil','br'),
 ('BR','Brazil','brazil'),
 ('BR','Brazil','巴西'),
 ('BS','Bahamas','bs'),
 ('BS','Bahamas','bahamas'),
 ('BS','Bahamas','巴哈马'),
 ('BT','Bhutan','bt'),
 ('BT','Bhutan','bhutan'),
 ('BT','Bhutan','不丹'),
 ('BV','Bouvet Island','bv'),
 ('BV','Bouvet Island','bouvet island'),
 ('BV','Bouvet Island','布韦岛'),
 ('BW','Botswana','bw'),
 ('BW','Botswana','botswana'),
 ('BW','Botswana','博茨瓦纳'),
 ('BY','Belarus','by'),
 ('BY','Belarus','belarus'),
 ('BY','Belarus','白俄罗斯'),
 ('BZ','Belize','bz'),
 ('BZ','Belize','belize'),
 ('BZ','Belize','伯利兹'),
 ('CA','Canada','ca'),
 ('CA','Canada','canada'),
 ('CA','Canada','加拿大'),
 ('CC','Cocos (Keeling) Islands','cc'),
 ('CC','Cocos (Keeling) Islands','cocos (keeling) islands'),
 ('CC','Cocos (Keeling) Islands','科科斯（基林）群岛'),
 ('CD','Congo - Kinshasa','cd'),
 ('CD','Congo - Kinshasa','congo - kinshasa'),
 ('CD','Congo - Kinshasa','刚果（金）'),
 ('CF','Central African Republic','cf'),
 ('CF','Central African Republic','central african republic'),
 ('CF','Central African Republic','中非共和国'),
 ('CG','Congo - Brazzaville','cg'),
 ('CG','Congo - Brazzaville','congo - brazzaville'),
 ('CG','Congo - Brazzaville','刚果（布）'),
 ('CH','Switzerland','ch'),
 ('CH','Switzerland','switzerland'),
 ('CH','Switzerland','瑞士'),
 ('CI','Côte d’Ivoire','ci'),
 ('CI','Côte d’Ivoire','côte d’ivoire'),
 ('CI','Côte d’Ivoire','科特迪瓦'),
 ('CK','Cook Islands','ck'),
 ('CK','Cook Islands','cook islands'),
 ('CK','Cook Islands','库克群岛'),
 ('CL','Chile','cl'),
 ('CL','Chile','chile'),
 ('CL','Chile','智利'),
 ('CM','Cameroon','cm'),
 ('CM','Cameroon','cameroon'),
 ('CM','Cameroon','喀麦隆'),
 ('CN','China','cn'),
 ('CN','China','china'),
 ('CN','China','中国'),
 ('CO','Colombia','co'),
 ('CO','Colombia','colombia'),
 ('CO','Colombia','哥伦比亚'),
 ('CR','Costa Rica','cr'),
 ('CR','Costa Rica','costa rica'),
 ('CR','Costa Rica','哥斯达黎加'),
 ('CU','Cuba','cu'),
 ('CU','Cuba','cuba'),
 ('CU','Cuba','古巴'),
 ('CV','Cape Verde','cv'),
 ('CV','Cape Verde','cape verde'),
 ('CV','Cape Verde','佛得角'),
 ('CW','Curaçao','cw'),
 ('CW','Curaçao','curaçao'),
 ('CW','Curaçao','库拉索'),
 ('CX','Christmas Island','cx'),
 ('CX','Christmas Island','christmas island'),
 ('CX','Christmas Island','圣诞岛'),
 ('CY','Cyprus','cy'),
 ('CY','Cyprus','cyprus'),
 ('CY','Cyprus','塞浦路斯'),
 ('CZ','Czechia','cz'),
 ('CZ','Czechia','czechia'),
 ('CZ','Czechia','捷克'),
 ('DE','Germany','de'),
 ('DE','Germany','germany'),
 ('DE','Germany','德国'),
 ('DJ','Djibouti','dj'),
 ('DJ','Djibouti','djibouti'),
 ('DJ','Djibouti','吉布提'),
 ('DK','Denmark','dk'),
 ('DK','Denmark','denmark'),
 ('DK','Denmark','丹麦'),
 ('DM','Dominica','dm'),
 ('DM','Dominica','dominica'),
 ('DM','Dominica','多米尼克'),
 ('DO','Dominican Republic','do'),
 ('DO','Dominican Republic','dominican republic'),
 ('DO','Dominican Republic','多米尼加共和国'),
 ('DZ','Algeria','dz'),
 ('DZ','Algeria','algeria'),
 ('DZ','Algeria','阿尔及利亚'),
 ('EC','Ecuador','ec'),
 ('EC','Ecuador','ecuador'),
 ('EC','Ecuador','厄瓜多尔'),
 ('EE','Estonia','ee'),
 ('EE','Estonia','estonia'),
 ('EE','Estonia','爱沙尼亚'),
 ('EG','Egypt','eg'),
 ('EG','Egypt','egypt'),
 ('EG','Egypt','埃及'),
 ('EH','Western Sahara','eh'),
 ('EH','Western Sahara','western sahara'),
 ('EH','Western Sahara','西撒哈拉'),
 ('ER','Eritrea','er'),
 ('ER','Eritrea','eritrea'),
 ('ER','Eritrea','厄立特里亚'),
 ('ES','Spain','es'),
 ('ES','Spain','spain'),
 ('ES','Spain','西班牙'),
 ('ET','Ethiopia','et'),
 ('ET','Ethiopia','ethiopia'),
 ('ET','Ethiopia','埃塞俄比亚'),
 ('FI','Finland','fi'),
 ('FI','Finland','finland'),
 ('FI','Finland','芬兰'),
 ('FJ','Fiji','fj'),
 ('FJ','Fiji','fiji'),
 ('FJ','Fiji','斐济'),
 ('FK','Falkland Islands','fk'),
 ('FK','Falkland Islands','falkland islands'),
 ('FK','Falkland Islands','福克兰群岛'),
 ('FM','Micronesia','fm'),
 ('FM','Micronesia','micronesia'),
 ('FM','Micronesia','密克罗尼西亚'),
 ('FO','Faroe Islands','fo'),
 ('FO','Faroe Islands','faroe islands'),
 ('FO','Faroe Islands','法罗群岛'),
 ('FR','France','fr'),
 ('FR','France','france'),
 ('FR','France','法国'),
 ('GA','Gabon','ga'),
 ('GA','Gabon','gabon'),
 ('GA','Gabon','加蓬'),
 ('GB','United Kingdom','gb'),
 ('GB','United Kingdom','united kingdom'),
 ('GB','United Kingdom','英国'),
 ('GD','Grenada','gd'),
 ('GD','Grenada','grenada'),
 ('GD','Grenada','格林纳达'),
 ('GE','Georgia','ge'),
 ('GE','Georgia','georgia'),
 ('GE','Georgia','格鲁吉亚'),
 ('GF','French Guiana','gf'),
 ('GF','French Guiana','french guiana'),
 ('GF','French Guiana','法属圭亚那'),
 ('GG','Guernsey','gg'),
 ('GG','Guernsey','guernsey'),
 ('GG','Guernsey','根西岛'),
 ('GH','Ghana','gh'),
 ('GH','Ghana','ghana'),
 ('GH','Ghana','加纳'),
 ('GI','Gibraltar','gi'),
 ('GI','Gibraltar','gibraltar'),
 ('GI','Gibraltar','直布罗陀'),
 ('GL','Greenland','gl'),
 ('GL','Greenland','greenland'),
 ('GL','Greenland','格陵兰'),
 ('GM','Gambia','gm'),
 ('GM','Gambia','gambia'),
 ('GM','Gambia','冈比亚'),
 ('GN','Guinea','gn'),
 ('GN','Guinea','guinea'),
 ('GN','Guinea','几内亚'),
 ('GP','Guadeloupe','gp'),
 ('GP','Guadeloupe','guadeloupe'),
 ('GP','Guadeloupe','瓜德罗普'),
 ('GQ','Equatorial Guinea','gq'),
 ('GQ','Equatorial Guinea','equatorial guinea'),
 ('GQ','Equatorial Guinea','赤道几内亚'),
 ('GR','Greece','gr'),
 ('GR','Greece','greece'),
 ('GR','Greece','希腊'),
 ('GS','South Georgia & South Sandwich Islands','gs'),
 ('GS','South Georgia & South Sandwich Islands','south georgia & south sandwich islands'),
 ('GS','South Georgia & South Sandwich Islands','南乔治亚和南桑威奇群岛'),
 ('GT','Guatemala','gt'),
 ('GT','Guatemala','guatemala'),
 ('GT','Guatemala','危地马拉'),
 ('GU','Guam','gu'),
 ('GU','Guam','guam'),
 ('GU','Guam','关岛'),
 ('GW','Guinea-Bissau','gw'),
 ('GW','Guinea-Bissau','guinea-bissau'),
 ('GW','Guinea-Bissau','几内亚比绍'),
 ('GY','Guyana','gy'),
 ('GY','Guyana','guyana'),
 ('GY','Guyana','圭亚那'),
 ('HK','Hong Kong SAR China','hk'),
 ('HK','Hong Kong SAR China','hong kong sar china'),
 ('HK','Hong Kong SAR China','中国香港特别行政区'),
 ('HM','Heard & McDonald Islands','hm'),
 ('HM','Heard & McDonald Islands','heard & mcdonald islands'),
 ('HM','Heard & McDonald Islands','赫德岛和麦克唐纳群岛'),
 ('HN','Honduras','hn'),
 ('HN','Honduras','honduras'),
 ('HN','Honduras','洪都拉斯'),
 ('HR','Croatia','hr'),
 ('HR','Croatia','croatia'),
 ('HR','Croatia','克罗地亚'),
 ('HT','Haiti','ht'),
 ('HT','Haiti','haiti'),
 ('HT','Haiti','海地'),
 ('HU','Hungary','hu'),
 ('HU','Hungary','hungary'),
 ('HU','Hungary','匈牙利'),
 ('ID','Indonesia','id'),
 ('ID','Indonesia','indonesia'),
 ('ID','Indonesia','印度尼西亚'),
 ('IE','Ireland','ie'),
 ('IE','Ireland','ireland'),
 ('IE','Ireland','爱尔兰'),
 ('IL','Israel','il'),
 ('IL','Israel','israel'),
 ('IL','Israel','以色列'),
 ('IM','Isle of Man','im'),
 ('IM','Isle of Man','isle of man'),
 ('IM','Isle of Man','马恩岛'),
 ('IN','India','in'),
 ('IN','India','india'),
 ('IN','India','印度'),
 ('IO','British Indian Ocean Territory','io'),
 ('IO','British Indian Ocean Territory','british indian ocean territory'),
 ('IO','British Indian Ocean Territory','英属印度洋领地'),
 ('IQ','Iraq','iq'),
 ('IQ','Iraq','iraq'),
 ('IQ','Iraq','伊拉克'),
 ('IR','Iran','ir'),
 ('IR','Iran','iran'),
 ('IR','Iran','伊朗'),
 ('IS','Iceland','is'),
 ('IS','Iceland','iceland'),
 ('IS','Iceland','冰岛'),
 ('IT','Italy','it'),
 ('IT','Italy','italy'),
 ('IT','Italy','意大利'),
 ('JE','Jersey','je'),
 ('JE','Jersey','jersey'),
 ('JE','Jersey','泽西岛'),
 ('JM','Jamaica','jm'),
 ('JM','Jamaica','jamaica'),
 ('JM','Jamaica','牙买加'),
 ('JO','Jordan','jo'),
 ('JO','Jordan','jordan'),
 ('JO','Jordan','约旦'),
 ('JP','Japan','jp'),
 ('JP','Japan','japan'),
 ('JP','Japan','日本'),
 ('KE','Kenya','ke'),
 ('KE','Kenya','kenya'),
 ('KE','Kenya','肯尼亚'),
 ('KG','Kyrgyzstan','kg'),
 ('KG','Kyrgyzstan','kyrgyzstan'),
 ('KG','Kyrgyzstan','吉尔吉斯斯坦'),
 ('KH','Cambodia','kh'),
 ('KH','Cambodia','cambodia'),
 ('KH','Cambodia','柬埔寨'),
 ('KI','Kiribati','ki'),
 ('KI','Kiribati','kiribati'),
 ('KI','Kiribati','基里巴斯'),
 ('KM','Comoros','km'),
 ('KM','Comoros','comoros'),
 ('KM','Comoros','科摩罗'),
 ('KN','St. Kitts & Nevis','kn'),
 ('KN','St. Kitts & Nevis','st. kitts & nevis'),
 ('KN','St. Kitts & Nevis','圣基茨和尼维斯'),
 ('KP','North Korea','kp'),
 ('KP','North Korea','north korea'),
 ('KP','North Korea','朝鲜'),
 ('KR','South Korea','kr'),
 ('KR','South Korea','south korea'),
 ('KR','South Korea','韩国'),
 ('KW','Kuwait','kw'),
 ('KW','Kuwait','kuwait'),
 ('KW','Kuwait','科威特'),
 ('KY','Cayman Islands','ky'),
 ('KY','Cayman Islands','cayman islands'),
 ('KY','Cayman Islands','开曼群岛'),
 ('KZ','Kazakhstan','kz'),
 ('KZ','Kazakhstan','kazakhstan'),
 ('KZ','Kazakhstan','哈萨克斯坦'),
 ('LA','Laos','la'),
 ('LA','Laos','laos'),
 ('LA','Laos','老挝'),
 ('LB','Lebanon','lb'),
 ('LB','Lebanon','lebanon'),
 ('LB','Lebanon','黎巴嫩'),
 ('LC','St. Lucia','lc'),
 ('LC','St. Lucia','st. lucia'),
 ('LC','St. Lucia','圣卢西亚'),
 ('LI','Liechtenstein','li'),
 ('LI','Liechtenstein','liechtenstein'),
 ('LI','Liechtenstein','列支敦士登'),
 ('LK','Sri Lanka','lk'),
 ('LK','Sri Lanka','sri lanka'),
 ('LK','Sri Lanka','斯里兰卡'),
 ('LR','Liberia','lr'),
 ('LR','Liberia','liberia'),
 ('LR','Liberia','利比里亚'),
 ('LS','Lesotho','ls'),
 ('LS','Lesotho','lesotho'),
 ('LS','Lesotho','莱索托'),
 ('LT','Lithuania','lt'),
 ('LT','Lithuania','lithuania'),
 ('LT','Lithuania','立陶宛'),
 ('LU','Luxembourg','lu'),
 ('LU','Luxembourg','luxembourg'),
 ('LU','Luxembourg','卢森堡'),
 ('LV','Latvia','lv'),
 ('LV','Latvia','latvia'),
 ('LV','Latvia','拉脱维亚'),
 ('LY','Libya','ly'),
 ('LY','Libya','libya'),
 ('LY','Libya','利比亚'),
 ('MA','Morocco','ma'),
 ('MA','Morocco','morocco'),
 ('MA','Morocco','摩洛哥'),
 ('MC','Monaco','mc'),
 ('MC','Monaco','monaco'),
 ('MC','Monaco','摩纳哥'),
 ('MD','Moldova','md'),
 ('MD','Moldova','moldova'),
 ('MD','Moldova','摩尔多瓦'),
 ('ME','Montenegro','me'),
 ('ME','Montenegro','montenegro'),
 ('ME','Montenegro','黑山'),
 ('MF','St. Martin','mf'),
 ('MF','St. Martin','st. martin'),
 ('MF','St. Martin','法属圣马丁'),
 ('MG','Madagascar','mg'),
 ('MG','Madagascar','madagascar'),
 ('MG','Madagascar','马达加斯加'),
 ('MH','Marshall Islands','mh'),
 ('MH','Marshall Islands','marshall islands'),
 ('MH','Marshall Islands','马绍尔群岛'),
 ('MK','North Macedonia','mk'),
 ('MK','North Macedonia','north macedonia'),
 ('MK','North Macedonia','北马其顿'),
 ('ML','Mali','ml'),
 ('ML','Mali','mali'),
 ('ML','Mali','马里'),
 ('MM','Myanmar (Burma)','mm'),
 ('MM','Myanmar (Burma)','myanmar (burma)'),
 ('MM','Myanmar (Burma)','缅甸'),
 ('MN','Mongolia','mn'),
 ('MN','Mongolia','mongolia'),
 ('MN','Mongolia','蒙古'),
 ('MO','Macao SAR China','mo'),
 ('MO','Macao SAR China','macao sar china'),
 ('MO','Macao SAR China','中国澳门特别行政区'),
 ('MP','Northern Mariana Islands','mp'),
 ('MP','Northern Mariana Islands','northern mariana islands'),
 ('MP','Northern Mariana Islands','北马里亚纳群岛'),
 ('MQ','Martinique','mq'),
 ('MQ','Martinique','martinique'),
 ('MQ','Martinique','马提尼克'),
 ('MR','Mauritania','mr'),
 ('MR','Mauritania','mauritania'),
 ('MR','Mauritania','毛里塔尼亚'),
 ('MS','Montserrat','ms'),
 ('MS','Montserrat','montserrat'),
 ('MS','Montserrat','蒙特塞拉特'),
 ('MT','Malta','mt'),
 ('MT','Malta','malta'),
 ('MT','Malta','马耳他'),
 ('MU','Mauritius','mu'),
 ('MU','Mauritius','mauritius'),
 ('MU','Mauritius','毛里求斯'),
 ('MV','Maldives','mv'),
 ('MV','Maldives','maldives'),
 ('MV','Maldives','马尔代夫'),
 ('MW','Malawi','mw'),
 ('MW','Malawi','malawi'),
 ('MW','Malawi','马拉维'),
 ('MX','Mexico','mx'),
 ('MX','Mexico','mexico'),
 ('MX','Mexico','墨西哥'),
 ('MY','Malaysia','my'),
 ('MY','Malaysia','malaysia'),
 ('MY','Malaysia','马来西亚'),
 ('MZ','Mozambique','mz'),
 ('MZ','Mozambique','mozambique'),
 ('MZ','Mozambique','莫桑比克'),
 ('NA','Namibia','na'),
 ('NA','Namibia','namibia'),
 ('NA','Namibia','纳米比亚'),
 ('NC','New Caledonia','nc'),
 ('NC','New Caledonia','new caledonia'),
 ('NC','New Caledonia','新喀里多尼亚'),
 ('NE','Niger','ne'),
 ('NE','Niger','niger'),
 ('NE','Niger','尼日尔'),
 ('NF','Norfolk Island','nf'),
 ('NF','Norfolk Island','norfolk island'),
 ('NF','Norfolk Island','诺福克岛'),
 ('NG','Nigeria','ng'),
 ('NG','Nigeria','nigeria'),
 ('NG','Nigeria','尼日利亚'),
 ('NI','Nicaragua','ni'),
 ('NI','Nicaragua','nicaragua'),
 ('NI','Nicaragua','尼加拉瓜'),
 ('NL','Netherlands','nl'),
 ('NL','Netherlands','netherlands'),
 ('NL','Netherlands','荷兰'),
 ('NO','Norway','no'),
 ('NO','Norway','norway'),
 ('NO','Norway','挪威'),
 ('NP','Nepal','np'),
 ('NP','Nepal','nepal'),
 ('NP','Nepal','尼泊尔'),
 ('NR','Nauru','nr'),
 ('NR','Nauru','nauru'),
 ('NR','Nauru','瑙鲁'),
 ('NU','Niue','nu'),
 ('NU','Niue','niue'),
 ('NU','Niue','纽埃'),
 ('NZ','New Zealand','nz'),
 ('NZ','New Zealand','new zealand'),
 ('NZ','New Zealand','新西兰'),
 ('OM','Oman','om'),
 ('OM','Oman','oman'),
 ('OM','Oman','阿曼'),
 ('PA','Panama','pa'),
 ('PA','Panama','panama'),
 ('PA','Panama','巴拿马'),
 ('PE','Peru','pe'),
 ('PE','Peru','peru'),
 ('PE','Peru','秘鲁'),
 ('PF','French Polynesia','pf'),
 ('PF','French Polynesia','french polynesia'),
 ('PF','French Polynesia','法属波利尼西亚'),
 ('PG','Papua New Guinea','pg'),
 ('PG','Papua New Guinea','papua new guinea'),
 ('PG','Papua New Guinea','巴布亚新几内亚'),
 ('PH','Philippines','ph'),
 ('PH','Philippines','philippines'),
 ('PH','Philippines','菲律宾'),
 ('PK','Pakistan','pk'),
 ('PK','Pakistan','pakistan'),
 ('PK','Pakistan','巴基斯坦'),
 ('PL','Poland','pl'),
 ('PL','Poland','poland'),
 ('PL','Poland','波兰'),
 ('PM','St. Pierre & Miquelon','pm'),
 ('PM','St. Pierre & Miquelon','st. pierre & miquelon'),
 ('PM','St. Pierre & Miquelon','圣皮埃尔和密克隆群岛'),
 ('PN','Pitcairn Islands','pn'),
 ('PN','Pitcairn Islands','pitcairn islands'),
 ('PN','Pitcairn Islands','皮特凯恩群岛'),
 ('PR','Puerto Rico','pr'),
 ('PR','Puerto Rico','puerto rico'),
 ('PR','Puerto Rico','波多黎各'),
 ('PS','Palestinian Territories','ps'),
 ('PS','Palestinian Territories','palestinian territories'),
 ('PS','Palestinian Territories','巴勒斯坦领土'),
 ('PT','Portugal','pt'),
 ('PT','Portugal','portugal'),
 ('PT','Portugal','葡萄牙'),
 ('PW','Palau','pw'),
 ('PW','Palau','palau'),
 ('PW','Palau','帕劳'),
 ('PY','Paraguay','py'),
 ('PY','Paraguay','paraguay'),
 ('PY','Paraguay','巴拉圭'),
 ('QA','Qatar','qa'),
 ('QA','Qatar','qatar'),
 ('QA','Qatar','卡塔尔'),
 ('RE','Réunion','re'),
 ('RE','Réunion','réunion'),
 ('RE','Réunion','留尼汪'),
 ('RO','Romania','ro'),
 ('RO','Romania','romania'),
 ('RO','Romania','罗马尼亚'),
 ('RS','Serbia','rs'),
 ('RS','Serbia','serbia'),
 ('RS','Serbia','塞尔维亚'),
 ('RU','Russia','ru'),
 ('RU','Russia','russia'),
 ('RU','Russia','俄罗斯'),
 ('RW','Rwanda','rw'),
 ('RW','Rwanda','rwanda'),
 ('RW','Rwanda','卢旺达'),
 ('SA','Saudi Arabia','sa'),
 ('SA','Saudi Arabia','saudi arabia'),
 ('SA','Saudi Arabia','沙特阿拉伯'),
 ('SB','Solomon Islands','sb'),
 ('SB','Solomon Islands','solomon islands'),
 ('SB','Solomon Islands','所罗门群岛'),
 ('SC','Seychelles','sc'),
 ('SC','Seychelles','seychelles'),
 ('SC','Seychelles','塞舌尔'),
 ('SD','Sudan','sd'),
 ('SD','Sudan','sudan'),
 ('SD','Sudan','苏丹'),
 ('SE','Sweden','se'),
 ('SE','Sweden','sweden'),
 ('SE','Sweden','瑞典'),
 ('SG','Singapore','sg'),
 ('SG','Singapore','singapore'),
 ('SG','Singapore','新加坡'),
 ('SH','St. Helena','sh'),
 ('SH','St. Helena','st. helena'),
 ('SH','St. Helena','圣赫勒拿'),
 ('SI','Slovenia','si'),
 ('SI','Slovenia','slovenia'),
 ('SI','Slovenia','斯洛文尼亚'),
 ('SJ','Svalbard & Jan Mayen','sj'),
 ('SJ','Svalbard & Jan Mayen','svalbard & jan mayen'),
 ('SJ','Svalbard & Jan Mayen','斯瓦尔巴和扬马延'),
 ('SK','Slovakia','sk'),
 ('SK','Slovakia','slovakia'),
 ('SK','Slovakia','斯洛伐克'),
 ('SL','Sierra Leone','sl'),
 ('SL','Sierra Leone','sierra leone'),
 ('SL','Sierra Leone','塞拉利昂'),
 ('SM','San Marino','sm'),
 ('SM','San Marino','san marino'),
 ('SM','San Marino','圣马力诺'),
 ('SN','Senegal','sn'),
 ('SN','Senegal','senegal'),
 ('SN','Senegal','塞内加尔'),
 ('SO','Somalia','so'),
 ('SO','Somalia','somalia'),
 ('SO','Somalia','索马里'),
 ('SR','Suriname','sr'),
 ('SR','Suriname','suriname'),
 ('SR','Suriname','苏里南'),
 ('SS','South Sudan','ss'),
 ('SS','South Sudan','south sudan'),
 ('SS','South Sudan','南苏丹'),
 ('ST','São Tomé & Príncipe','st'),
 ('ST','São Tomé & Príncipe','são tomé & príncipe'),
 ('ST','São Tomé & Príncipe','圣多美和普林西比'),
 ('SV','El Salvador','sv'),
 ('SV','El Salvador','el salvador'),
 ('SV','El Salvador','萨尔瓦多'),
 ('SX','Sint Maarten','sx'),
 ('SX','Sint Maarten','sint maarten'),
 ('SX','Sint Maarten','荷属圣马丁'),
 ('SY','Syria','sy'),
 ('SY','Syria','syria'),
 ('SY','Syria','叙利亚'),
 ('SZ','Eswatini','sz'),
 ('SZ','Eswatini','eswatini'),
 ('SZ','Eswatini','斯威士兰'),
 ('TC','Turks & Caicos Islands','tc'),
 ('TC','Turks & Caicos Islands','turks & caicos islands'),
 ('TC','Turks & Caicos Islands','特克斯和凯科斯群岛'),
 ('TD','Chad','td'),
 ('TD','Chad','chad'),
 ('TD','Chad','乍得'),
 ('TF','French Southern Territories','tf'),
 ('TF','French Southern Territories','french southern territories'),
 ('TF','French Southern Territories','法属南部领地'),
 ('TG','Togo','tg'),
 ('TG','Togo','togo'),
 ('TG','Togo','多哥'),
 ('TH','Thailand','th'),
 ('TH','Thailand','thailand'),
 ('TH','Thailand','泰国'),
 ('TJ','Tajikistan','tj'),
 ('TJ','Tajikistan','tajikistan'),
 ('TJ','Tajikistan','塔吉克斯坦'),
 ('TK','Tokelau','tk'),
 ('TK','Tokelau','tokelau'),
 ('TK','Tokelau','托克劳'),
 ('TL','Timor-Leste','tl'),
 ('TL','Timor-Leste','timor-leste'),
 ('TL','Timor-Leste','东帝汶'),
 ('TM','Turkmenistan','tm'),
 ('TM','Turkmenistan','turkmenistan'),
 ('TM','Turkmenistan','土库曼斯坦'),
 ('TN','Tunisia','tn'),
 ('TN','Tunisia','tunisia'),
 ('TN','Tunisia','突尼斯'),
 ('TO','Tonga','to'),
 ('TO','Tonga','tonga'),
 ('TO','Tonga','汤加'),
 ('TR','Türkiye','tr'),
 ('TR','Türkiye','türkiye'),
 ('TR','Türkiye','土耳其'),
 ('TT','Trinidad & Tobago','tt'),
 ('TT','Trinidad & Tobago','trinidad & tobago'),
 ('TT','Trinidad & Tobago','特立尼达和多巴哥'),
 ('TV','Tuvalu','tv'),
 ('TV','Tuvalu','tuvalu'),
 ('TV','Tuvalu','图瓦卢'),
 ('TW','Taiwan','tw'),
 ('TW','Taiwan','taiwan'),
 ('TW','Taiwan','台湾'),
 ('TZ','Tanzania','tz'),
 ('TZ','Tanzania','tanzania'),
 ('TZ','Tanzania','坦桑尼亚'),
 ('UA','Ukraine','ua'),
 ('UA','Ukraine','ukraine'),
 ('UA','Ukraine','乌克兰'),
 ('UG','Uganda','ug'),
 ('UG','Uganda','uganda'),
 ('UG','Uganda','乌干达'),
 ('UM','U.S. Outlying Islands','um'),
 ('UM','U.S. Outlying Islands','u.s. outlying islands'),
 ('UM','U.S. Outlying Islands','美国本土外小岛屿'),
 ('US','United States','us'),
 ('US','United States','united states'),
 ('US','United States','美国'),
 ('UY','Uruguay','uy'),
 ('UY','Uruguay','uruguay'),
 ('UY','Uruguay','乌拉圭'),
 ('UZ','Uzbekistan','uz'),
 ('UZ','Uzbekistan','uzbekistan'),
 ('UZ','Uzbekistan','乌兹别克斯坦'),
 ('VA','Vatican City','va'),
 ('VA','Vatican City','vatican city'),
 ('VA','Vatican City','梵蒂冈'),
 ('VC','St. Vincent & Grenadines','vc'),
 ('VC','St. Vincent & Grenadines','st. vincent & grenadines'),
 ('VC','St. Vincent & Grenadines','圣文森特和格林纳丁斯'),
 ('VE','Venezuela','ve'),
 ('VE','Venezuela','venezuela'),
 ('VE','Venezuela','委内瑞拉'),
 ('VG','British Virgin Islands','vg'),
 ('VG','British Virgin Islands','british virgin islands'),
 ('VG','British Virgin Islands','英属维尔京群岛'),
 ('VI','U.S. Virgin Islands','vi'),
 ('VI','U.S. Virgin Islands','u.s. virgin islands'),
 ('VI','U.S. Virgin Islands','美属维尔京群岛'),
 ('VN','Vietnam','vn'),
 ('VN','Vietnam','vietnam'),
 ('VN','Vietnam','越南'),
 ('VU','Vanuatu','vu'),
 ('VU','Vanuatu','vanuatu'),
 ('VU','Vanuatu','瓦努阿图'),
 ('WF','Wallis & Futuna','wf'),
 ('WF','Wallis & Futuna','wallis & futuna'),
 ('WF','Wallis & Futuna','瓦利斯和富图纳'),
 ('WS','Samoa','ws'),
 ('WS','Samoa','samoa'),
 ('WS','Samoa','萨摩亚'),
 ('YE','Yemen','ye'),
 ('YE','Yemen','yemen'),
 ('YE','Yemen','也门'),
 ('YT','Mayotte','yt'),
 ('YT','Mayotte','mayotte'),
 ('YT','Mayotte','马约特'),
 ('ZA','South Africa','za'),
 ('ZA','South Africa','south africa'),
 ('ZA','South Africa','南非'),
 ('ZM','Zambia','zm'),
 ('ZM','Zambia','zambia'),
 ('ZM','Zambia','赞比亚'),
 ('ZW','Zimbabwe','zw'),
 ('ZW','Zimbabwe','zimbabwe'),
 ('ZW','Zimbabwe','津巴布韦'),
 ('US','United States','usa'),
 ('GB','United Kingdom','uk'),
 ('AE','United Arab Emirates','uae'),
 ('AE','United Arab Emirates','阿联酋'),
 ('AM','Armenia','հայաստան'),
 ('TR','Türkiye','turkey')
$$;

-- Pure, bounded local rules. No provider call, dynamic SQL, sender-domain inference,
-- quantity summation, or original-email text in the returned summary.
create function private.parse_email_needs(subject text,body text) returns jsonb
language plpgsql immutable set search_path='' as $$
declare text_value text;line text;products text[]:='{}';projects text[]:='{}';quantity_values text[]:='{}';country_codes text[]:='{}';country_name text;
 evidence jsonb:='{}';uncertain text[]:='{}';m text[];r record;value text;number_low bigint;number_high bigint;units text;approx text;score integer;best_score integer:=-1;count_matches integer:=0;
 product text;quantity text;country text;summary text;project text;contexts integer:=0;context_before text;existing_quantity text;
begin
 if length(coalesce(subject,''))+length(coalesce(body,''))>64000 then return jsonb_build_object('rule_version','email-needs-rules-v1','fields','{}'::jsonb,'evidence','{}'::jsonb,'unresolved',array['source_too_long']);end if;
 text_value:=replace(coalesce(body,''),E'\r',E'\n');
 text_value:=regexp_replace(text_value,'(?is)(?:^|\n)\s*(best regards|kind regards|regards|sincerely|thanks and regards|此致|顺祝)[,，:：!！. ]*\n.*$','');
 text_value:=regexp_replace(text_value,'(?is)\n\s*On [^\n]{5,150}wrote:\s*\n.*$','');
 -- Never search HTML/script instructions or email signatures as demand evidence.
 text_value:=regexp_replace(text_value,'(?is)<script\y[^>]*>.*?</script>',' ');
 text_value:=regexp_replace(text_value,'<[^>]+>',' ','g');
 text_value:=coalesce(subject,'')||E'\n'||text_value;
 select coalesce(string_agg(s,E'\n'),'') into text_value from regexp_split_to_table(text_value,E'\n') s
 where s !~* '(do not (need|require|want)|don''t (need|require|want)|no (need|requirement) for|not (required|needed)|不需要|无需|不要)';
 if text_value ~* '(steel[ -]+fire[ -]*(rated|resistant)?[ -]*doors?|fire[ -]*(rated|resistant)?[ -]+steel[ -]+doors?|钢质防火门|钢制防火门)' then
  products:=array_append(products,'Steel fire doors');
  text_value:=regexp_replace(text_value,'(steel[ -]+fire[ -]*(rated|resistant)?[ -]*doors?|fire[ -]*(rated|resistant)?[ -]+steel[ -]+doors?|钢质防火门|钢制防火门)',' [matched steel fire product] ','gi');
 end if;
 for r in select * from (values
 ('Fire doors','fire[ -]*(rated|resistant)?[ -]*doors?|防火门'),
 ('Steel doors','steel[ -]+doors?|钢质门|钢制门'),('Security doors','security[ -]+doors?|防盗门'),
 ('Wooden doors','wood(en)?[ -]+doors?|木门'),('Smart locks','smart[ -]+locks?|digital[ -]+locks?|智能锁|电子锁'),
 ('Medical doors','hospital[ -]+doors?|medical[ -]+doors?|医用门'),('Armored doors','armo[u]?red[ -]+doors?|装甲门'),
 ('Cast aluminum doors','cast[ -]+alumin[iu]+m[ -]+doors?|铸铝门'),('Copper doors','copper[ -]+doors?|铜门'),
 ('Aluminum windows','alumin[iu]+m[ -]+windows?|铝合金门窗'),('Door hardware','door[ -]+hardware|门用五金|门锁五金')
 ) d(label,pattern) loop
  if text_value ~* r.pattern then products:=array_append(products,r.label);evidence:=evidence||jsonb_build_object('product_category',jsonb_build_object('source','subject_or_request_body','rule','explicit_product_term'));end if;
 end loop;
 if cardinality(products)=0 and text_value ~* '\mdoors?\M|采购门|需求门' then products:=array['Doors'];end if;
 if cardinality(products)>4 then uncertain:=array_append(uncertain,'product_categories_too_many');products:='{}';end if;
 product:=nullif(array_to_string(products,'; '),'');
 -- Unit-bound quantities outrank line-item counts. Do not add per-line quantities.
 for line in select s from regexp_split_to_table(text_value,E'\n') s loop
  for m in select regexp_matches(line,'(?:^|[^[:alnum:],.$€£])((?:approx(?:imately)?\.?|about|around|~|约)?)[ ]*([0-9]{1,3}(?:,[0-9]{3})+|[0-9]{1,7})(?:[ ]*[-–~至][ ]*([0-9]{1,3}(?:,[0-9]{3})+|[0-9]{1,7}))?[ ]*(doors?|locks?|sets?|pcs?|pieces?|units?|樘|扇|套|把|件)\M','gi') loop
   count_matches:=count_matches+1;
   if count_matches>50 then quantity_values:='{}';uncertain:=array_append(uncertain,'too_many_quantity_matches');exit;end if;
   context_before:=lower(substr(line,greatest(1,strpos(line,m[2])-24),least(24,strpos(line,m[2])-1)));
   if context_before ~ '(model|sku|part no|型号|料号|货号)[^\n]{0,18}$|\m(usd|eur|gbp|price|cost)\M[^[:alpha:]]*$|[$€£][ ]*$' then continue;end if;
   number_low:=replace(m[2],',','')::bigint;number_high:=nullif(replace(coalesce(m[3],''),',',''),'')::bigint;
   if number_low<1 or number_low>9999999 or (number_high is not null and (number_high<number_low or number_high>9999999)) then continue;end if;
   units:=case when lower(m[4]) ~ '^(door|樘|扇)' then 'doors' when lower(m[4]) ~ '^(lock|把)' then 'locks' when lower(m[4]) ~ '^(set|套)' then 'sets' else 'pieces' end;
   approx:=case when coalesce(m[1],'')<>'' then 'approx. ' else '' end;
   value:=approx||number_low::text||case when number_high is null then '' else '-'||number_high::text end||' '||units;
   score:=case when line ~* '\m(total|overall|combined)\M|总数量|总计|合计' then 3 when units in('doors','locks') then 2 else 1 end;
   if score>best_score then best_score:=score;quantity_values:=array[value];elsif score=best_score and not value=any(quantity_values) then quantity_values:=array_append(quantity_values,value);end if;
  end loop;
  for m in select regexp_matches(line,'^[ ]*(?:quantity|qty|total quantity|数量|总数量|件数)[ ]*[:：=][ ]*(approx(?:imately)?\.?|about|around|~|约)?[ ]*([0-9]{1,3}(?:,[0-9]{3})+|[0-9]{1,7})(?:[ ]*[-–~至][ ]*([0-9]{1,3}(?:,[0-9]{3})+|[0-9]{1,7}))?[ ]*$','gi') loop
   number_low:=replace(m[2],',','')::bigint;number_high:=nullif(replace(coalesce(m[3],''),',',''),'')::bigint;
   if number_low<1 or number_low>9999999 or (number_high is not null and (number_high<number_low or number_high>9999999)) then continue;end if;
   value:=case when coalesce(m[1],'')<>'' then 'approx. ' else '' end||number_low::text||case when number_high is null then '' else '-'||number_high::text end;
   score:=case when line ~* 'total|总' then 3 else 2 end;
   if score>best_score then best_score:=score;quantity_values:=array[value];
   elsif score=best_score then
    select v into existing_quantity from unnest(quantity_values) v where regexp_replace(v,'[^0-9-]','','g')=regexp_replace(value,'[^0-9-]','','g') limit 1;
    if existing_quantity is null then quantity_values:=array_append(quantity_values,value);
    elsif value like 'approx. %' and existing_quantity not like 'approx. %' then quantity_values:=array_replace(quantity_values,existing_quantity,'approx. '||existing_quantity);end if;
   end if;
  end loop;
  if count_matches>50 then exit;end if;
 end loop;
 if cardinality(quantity_values)=1 then quantity:=quantity_values[1];evidence:=evidence||jsonb_build_object('quantity',jsonb_build_object('source','subject_or_request_body','rule','explicit_count_and_unit'));elsif cardinality(quantity_values)>1 then uncertain:=array_append(uncertain,'conflicting_quantities');end if;
 -- Explicit country/delivery/project-location context only; never signatures,
 -- company websites, sender domains, phone codes, nationality, or shipping origin.
 for m in
  select regexp_matches(text_value,'(?:^|\n)[ ]*(?:country|destination(?: country)?|project (?:location|country|site)|delivery (?:country|location)|ship[- ]?to|国家|目的国|项目所在地|交货国家|pa[ií]s|pays|страна)[ ]*[:：=-][ ]*([^\n;]{2,120})','gi')
  union all select regexp_matches(text_value,'\m(?:project(?:[ ]+[[:alnum:]&-]+){0,5}[ ]+in|deliver(?:y)?[ ]+to|ship(?:ping)?[ ]+to)[ ]+([^\n;]{2,120})','gi')
 loop
  contexts:=contexts+1;if contexts>12 then country_codes:='{}';uncertain:=array_append(uncertain,'too_many_country_contexts');exit;end if;
  if m[1] ~ '://|@' then continue;end if;
  for r in select * from private.email_need_countries() loop
   if (length(r.alias)=2 and m[1] ~ ('(^|[^[:alpha:]])'||upper(r.alias)||'([^[:alpha:]]|$)')) or (length(r.alias)>2 and lower(m[1]) ~ ('(^|[^[:alpha:]])'||regexp_replace(r.alias,'([.()+?*\[\]{}^$|\\])','\\\1','g')||'([^[:alpha:]]|$)')) then
    if not r.code=any(country_codes) then country_codes:=array_append(country_codes,r.code);country_name:=r.name;end if;
   end if;
  end loop;
 end loop;
 if cardinality(country_codes)=1 then country:=country_name;evidence:=evidence||jsonb_build_object('target_country',jsonb_build_object('source','request_body','rule','explicit_country_or_project_destination'));elsif cardinality(country_codes)>1 then uncertain:=array_append(uncertain,'conflicting_countries');end if;
 for r in select * from (values('Residential','residential|apartment|housing|住宅|公寓'),('Hotel','hotel|酒店'),('Hospital','hospital|医院'),('School','school|学校'),('Commercial','commercial|商业'),('Industrial','industrial|工业')) d(label,pattern) loop
  if text_value ~* r.pattern then projects:=array_append(projects,r.label);end if;
 end loop;
 project:=nullif(array_to_string(projects,', '),'');
 if product is null then uncertain:=array_append(uncertain,'product_category');end if;
 if country is null then uncertain:=array_append(uncertain,'target_country');end if;
 if quantity is null then uncertain:=array_append(uncertain,'quantity');end if;
 if product is not null or quantity is not null then
  summary:='Product: '||coalesce(product,'not clearly stated')||'. Quantity: '||coalesce(quantity,'not clearly stated')||'. Country: '||coalesce(country,'not explicitly stated')||'.'||case when project is null then '' else ' Project type: '||project||'.' end;
 end if;
 return jsonb_build_object('rule_version','email-needs-rules-v1','fields',jsonb_strip_nulls(jsonb_build_object('product_category',product,'target_country',country,'quantity',quantity,'demand_summary',summary)),'evidence',evidence,'project_type',project,'unresolved',to_jsonb(uncertain),'review_status','pending_human_review');
end $$;

-- RPC uses caller rights and the original inquiry/audit RLS, without widening
-- original-email visibility. The parser is pure and reads only its input text.
create function public.extract_inquiry_email_needs(target_inquiry uuid,recheck boolean default false) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare actor public.profiles;i public.inquiries;parsed jsonb;patch jsonb:='{}';field text;applied text[]:='{}';kept text[]:='{}';source_hash text;previous jsonb;
begin
 if auth.uid() is null or coalesce(auth.jwt()->>'role','')='crm_marketing_readonly' or coalesce(auth.jwt()->'app_metadata'->>'crm_read_only','false')='true' then raise exception '当前账号不可提取需求';end if;
 select * into actor from public.profiles where id=auth.uid() and active and not coalesce(is_test_data,false) and data_environment='production';
 if actor.id is null then raise exception '账号不可用';end if;
 select * into i from public.inquiries where id=$1 and source='email' and archived_at is null and not coalesce(is_test_data,false) and data_environment='production' for update;
 if i.id is null then raise exception '邮件询盘不可见或不可编辑';end if;
 source_hash:=md5(coalesce(i.title,'')||E'\n'||coalesce(i.original_message,''));
 select after_data into previous from public.audit_logs where entity_type='inquiry' and entity_id=i.id and action='email_needs_extracted' and after_data->>'source_hash'=source_hash and after_data->>'rule_version'='email-needs-rules-v1' order by created_at desc limit 1;
 if previous is not null and not coalesce($2,false) then return jsonb_build_object('fields',jsonb_build_object('product_category',i.product_category,'target_country',i.target_country,'quantity',i.quantity,'demand_summary',i.demand_summary,'updated_at',i.updated_at),'report',previous,'deduplicated',true);end if;
 if (select count(*) from public.audit_logs where actor_id=actor.id and action='email_needs_extracted' and created_at>clock_timestamp()-interval '1 minute')>=10 then raise exception '提取较频繁，请一分钟后重试';end if;
 parsed:=private.parse_email_needs(i.title,i.original_message);
 foreach field in array array['product_category','target_country','quantity','demand_summary'] loop
  if nullif(btrim(to_jsonb(i)->>field),'') is not null then kept:=array_append(kept,field);
  elsif nullif(parsed->'fields'->>field,'') is not null then applied:=array_append(applied,field);patch:=patch||jsonb_build_object(field,parsed->'fields'->field);end if;
 end loop;
 -- The generated summary must describe the record's actual fields, not a
 -- conflicting source proposal when a human has already supplied another value.
 if 'demand_summary'=any(applied) and exists(select 1 from unnest(kept) k where k<>'demand_summary' and (to_jsonb(i)->>k) is distinct from (parsed->'fields'->>k)) then
  applied:=array_remove(applied,'demand_summary');patch:=patch-'demand_summary';parsed:=jsonb_set(parsed,'{unresolved}',(parsed->'unresolved')||'"summary_conflicts_with_existing_fields"'::jsonb);
 end if;
 if cardinality(applied)>0 then
  update public.inquiries set product_category=case when patch?'product_category' then patch->>'product_category' else product_category end,
   target_country=case when patch?'target_country' then patch->>'target_country' else target_country end,
   quantity=case when patch?'quantity' then patch->>'quantity' else quantity end,
   demand_summary=case when patch?'demand_summary' then patch->>'demand_summary' else demand_summary end,
   updated_by=auth.uid(),updated_at=clock_timestamp(),last_change_reason='原邮件基本需求自动提取；仅补空字段，待人工核实' where id=i.id;
  if not found then raise exception '无权编辑邮件询盘';end if;
 end if;
 parsed:=(parsed-'fields')||jsonb_build_object('source_hash',source_hash,'applied_fields',to_jsonb(applied),'preserved_fields',to_jsonb(kept),'mechanism','local_database_rules','source_kind','original_email');
 insert into public.audit_logs(actor_id,entity_type,entity_id,action,before_data,after_data,reason)
 values(actor.id,'inquiry',i.id,'email_needs_extracted',jsonb_build_object('filled_fields',to_jsonb(kept)),parsed,'用户授权CRM内原邮件规则提取；原文不外发、不覆盖人工字段、不自动判定有效性');
 select * into i from public.inquiries where id=$1;
 return jsonb_build_object('fields',jsonb_build_object('product_category',i.product_category,'target_country',i.target_country,'quantity',i.quantity,'demand_summary',i.demand_summary,'updated_at',i.updated_at),'report',parsed,'deduplicated',false);
end $$;
revoke all on function private.email_need_countries(),private.parse_email_needs(text,text) from public,anon,service_role;
grant execute on function private.email_need_countries(),private.parse_email_needs(text,text) to authenticated;
revoke all on function public.extract_inquiry_email_needs(uuid,boolean) from public,anon,service_role;
grant execute on function public.extract_inquiry_email_needs(uuid,boolean) to authenticated;

-- A closed structured projection for the approved group's basic demand scope.
-- Arbitrary demand_summary, names, project IDs, mail text, contacts and money
-- are never copied into the queue or returned by this helper.
create function private.email_needs_notice(row_data jsonb) returns jsonb language plpgsql immutable set search_path='' as $$
declare p jsonb;k text;
begin
 if row_data->>'source' is distinct from 'email' or coalesce(row_data->>'demand_summary','') not like 'Product: %' then return null;end if;
 p:=private.parse_email_needs(row_data->>'title',row_data->>'original_message');
 if row_data->>'demand_summary' is distinct from (p->'fields'->>'demand_summary') then return null;end if;
 foreach k in array array['product_category','target_country','quantity'] loop
  if nullif(row_data->>k,'') is distinct from nullif(p->'fields'->>k,'') then return null;end if;
 end loop;
 return ((p->'fields')-'demand_summary')||jsonb_build_object('project_type',p->'project_type','review_status','pending_human_review','rule_version','email-needs-rules-v1');
end$$;
revoke all on function private.email_needs_notice(jsonb) from public,anon,authenticated,service_role;

create or replace function public.convert_email_intakes_to_inquiries(target_ids uuid[]) returns table(result_intake_id uuid,result_inquiry_id uuid,was_created boolean) language plpgsql security definer set search_path='' as $$
declare
  intake public.email_intake;
  company_id uuid;
  contact_id uuid;
  new_inquiry_id uuid;
  actor_id uuid := auth.uid();
  received_time timestamptz;
  email_needs jsonb;
begin
  if coalesce(private.current_crm_role()::text,'') not in ('owner','marketing') or coalesce(auth.jwt()->>'role','')='crm_marketing_readonly' or coalesce(auth.jwt()->'app_metadata'->>'crm_read_only','false')='true' or not exists(select 1 from public.profiles p where p.id=actor_id and p.active and not coalesce(p.is_test_data,false) and p.data_environment='production') then
    raise exception '仅市场部或老板可将邮件转为询盘';
  end if;

  for intake in
    select e.* from public.email_intake e
    where e.id = any(target_ids)
    order by coalesce(e.received_at,e.created_at),e.id
    for update
  loop
    if intake.triage_label = 'warmup' or intake.processing_status = 'rejected' then
      raise exception '邮件 % 已标记为养号或排除，不能转为询盘', intake.id;
    end if;

    if intake.inquiry_id is not null then
      insert into public.audit_logs(actor_id,entity_type,entity_id,action,before_data,after_data,reason)
      values(
        actor_id,'email_intake',intake.id,'convert_email_to_inquiry',
        jsonb_build_object('inquiry_id',intake.inquiry_id,'processing_status',intake.processing_status,'triage_label',intake.triage_label),
        jsonb_build_object('inquiry_id',intake.inquiry_id,'processing_status',case when intake.processing_status='pending_review' then 'converted' else intake.processing_status end,'triage_label','real'),
        '人工确认已有询盘关联邮件为真实邮件；未重复创建询盘'
      );
      update public.email_intake
      set triage_label='real',triaged_by=actor_id,triaged_at=coalesce(triaged_at,clock_timestamp()),
          processing_status=case when processing_status='pending_review' then 'converted' else processing_status end,
          updated_at=clock_timestamp()
      where id=intake.id;
      perform private.link_email_intake_messages(intake.id,intake.inquiry_id);
      result_intake_id:=intake.id;
      result_inquiry_id:=intake.inquiry_id;
      was_created:=false;
      return next;
      continue;
    end if;

    company_id:=null;
    contact_id:=null;
    new_inquiry_id:=null;
    received_time:=coalesce(intake.received_at,intake.created_at,clock_timestamp());

    select c.id,c.company_id into contact_id,company_id
    from public.contacts c
    where lower(c.email)=lower(intake.sender_email)
    limit 1;

    if company_id is null then
      insert into public.companies(name,domain,created_by)
      values(coalesce(nullif(trim(intake.sender_name),''),'待核实邮件客户'),null,actor_id)
      returning id into company_id;
    end if;

    if contact_id is null then
      insert into public.contacts(company_id,full_name,email,created_by)
      values(company_id,nullif(trim(intake.sender_name),''),intake.sender_email,actor_id)
      returning id into contact_id;
    end if;

    email_needs:=private.parse_email_needs(coalesce(nullif(trim(intake.subject),''),'来自客户邮件的询盘'),intake.body_text);
    insert into public.inquiries(
      company_id,contact_id,title,source,original_message,status,validity,product_category,target_country,quantity,demand_summary,
      created_by,updated_by,created_at,first_contact_due_at,last_change_reason
    ) values (
      company_id,contact_id,coalesce(nullif(trim(intake.subject),''),'来自客户邮件的询盘'),
      'email',intake.body_text,'pending_assignment','pending',email_needs->'fields'->>'product_category',email_needs->'fields'->>'target_country',email_needs->'fields'->>'quantity',email_needs->'fields'->>'demand_summary',actor_id,actor_id,received_time,
      received_time + interval '10 minutes','人工确认真实邮件并转为询盘商机'
    ) returning id into new_inquiry_id;

    update public.email_intake
    set inquiry_id=new_inquiry_id,triage_label='real',triaged_by=actor_id,
        triaged_at=clock_timestamp(),processing_status='converted',updated_at=clock_timestamp()
    where id=intake.id;

    perform private.link_email_intake_messages(intake.id,new_inquiry_id);
    insert into public.audit_logs(actor_id,entity_type,entity_id,action,before_data,after_data,reason)
    values(actor_id,'inquiry',new_inquiry_id,'email_needs_extracted',jsonb_build_object('filled_fields','[]'::jsonb),
     (email_needs-'fields')||jsonb_build_object('source_hash',md5(coalesce(nullif(trim(intake.subject),''),'来自客户邮件的询盘')||E'\n'||coalesce(intake.body_text,'')),
     'applied_fields',(select coalesce(jsonb_agg(key),'[]') from jsonb_object_keys(email_needs->'fields') key),'preserved_fields','[]'::jsonb,'mechanism','local_database_rules','source_kind','original_email'),
     '原邮件转询盘时自动提取基本需求；数据库内规则处理、待人工核实，原邮件不外发');


    insert into public.audit_logs(actor_id,entity_type,entity_id,action,before_data,after_data,reason)
    values(
      actor_id,'email_intake',intake.id,'convert_email_to_inquiry',
      jsonb_build_object('inquiry_id',null,'processing_status',intake.processing_status,'triage_label',intake.triage_label),
      jsonb_build_object('inquiry_id',new_inquiry_id,'processing_status','converted','triage_label','real'),
      '市场部人工确认真实邮件并一键转为询盘商机'
    );

    result_intake_id:=intake.id;
    result_inquiry_id:=new_inquiry_id;
    was_created:=true;
    return next;
  end loop;
end;
$$;

create or replace function private.capture_pipeline_feishu() returns trigger language plpgsql security definer set search_path='' as $$
declare c private.pipeline_feishu_config; n jsonb:=to_jsonb(new);o jsonb; p jsonb; base jsonb; linked public.inquiries;
 kind text:=case when tg_table_name='inquiries' then 'inquiry' else 'intake' end;
 target uuid;owner_id uuid;actor_id uuid;first_hash text;last_hash text;key text;notice uuid;changes jsonb;
begin
 select * into c from private.pipeline_feishu_config where singleton;
 if not c.enabled then return new;end if;
 if kind='inquiry' and (coalesce((n->>'is_test_data')::boolean,false) or n->>'data_environment' is distinct from 'production') then return new;end if;
 if tg_op='UPDATE' then
  o:=to_jsonb(old);
  if kind='inquiry' and (coalesce((o->>'is_test_data')::boolean,false) or o->>'data_environment' is distinct from 'production') then return new;end if;
 else o:='{}';end if;
 if kind='inquiry' and (nullif(n->>'archived_at','') is not null or coalesce((n->>'excluded_from_dashboard')::boolean,false)) then return new;end if;
 -- Old public-mail imports do not masquerade as newly arrived mail; human re-triage still notifies.
 if kind='intake' and tg_op='INSERT' and coalesce((n->>'received_at')::timestamptz,(n->>'created_at')::timestamptz,clock_timestamp())<c.enabled_at then return new;end if;
 first_hash:=md5(private.pipeline_projection(o,kind)::text);last_hash:=md5(private.pipeline_projection(n,kind)::text);
 if first_hash=last_hash then return new;end if;
 select coalesce(jsonb_agg(e.key order by e.key),'[]') into changes from jsonb_each(private.pipeline_projection(n,kind)) e where e.value is distinct from (o->e.key);
 target:=case when kind='inquiry' then (n->>'id')::uuid else nullif(n->>'inquiry_id','')::uuid end;
 if kind='intake' and target is not null then
  select * into linked from public.inquiries where id=target and not coalesce(is_test_data,false) and data_environment='production' and archived_at is null and not coalesce(excluded_from_dashboard,false);
  if not found then return new;end if;base:=to_jsonb(linked);
 else base:=case when kind='inquiry' then n else '{}'::jsonb end;end if;
 owner_id:=nullif(base->>'owner_id','')::uuid;
 actor_id:=coalesce(auth.uid(),nullif(n->>'updated_by','')::uuid,nullif(n->>'triaged_by','')::uuid,nullif(n->>'created_by','')::uuid);
 p:=jsonb_build_object('version',1,'kind',kind,'entity_id',n->>'id','inquiry_id',target,'inquiry_no',base->'inquiry_no',
 'created',tg_op='INSERT','from_status',o->'status','from_validity',o->'validity','from_owner',o->'owner_id',
 'status',base->'status','validity',base->'validity','owner_set',owner_id is not null,
 'owner_name',private.pipeline_person(owner_id),'manager_name',private.pipeline_manager(owner_id),
 'market_name',private.pipeline_person(coalesce(nullif(n->>'assigned_marketing_id','')::uuid,nullif(n->>'triaged_by','')::uuid,case when base->>'nurture_status'='nurturing' then nullif(base->>'nurture_updated_by','')::uuid end,nullif(base->>'created_by','')::uuid)),
 'actor_name',case when auth.uid() is null then null else private.pipeline_person(actor_id) end,
 'triage_label',n->'triage_label','processing_status',n->'processing_status','trashed',nullif(n->>'trashed_at','') is not null,
 'invalid_review_status',base->'invalid_review_status','next_follow_up_at',base->'next_follow_up_at','first_contact_done',nullif(base->>'first_valid_contact_at','') is not null,'nurture_status',base->'nurture_status','sales_disposition',base->'sales_disposition','nurture_next_at',base->'nurture_next_at',
 'raw_product',left(coalesce(base->>'product_category',''),200),'raw_country',left(coalesce(base->>'target_country',''),100),'raw_quantity',left(coalesce(base->>'quantity',''),100),
 'email_needs',private.email_needs_notice(base),
 'changed_fields',changes);
 -- Converting mail creates an inquiry in the same transaction: one linked event is enough.
 if kind='intake' and target is not null then
  with combined as(update private.pipeline_feishu_queue q set state='cancelled',last_error='combined_with_intake_conversion'
   where q.event_key='inquiry:'||target::text||':'||txid_current()::text and q.state='pending' and q.payload->>'created'='true' returning q.id)
  insert into private.pipeline_feishu_audit(notice_id,action,details) select id,'cancelled','{"reason":"combined_with_intake_conversion"}' from combined;
 end if;
 key:=kind||':'||(n->>'id')||':'||txid_current()::text;
 insert into private.pipeline_feishu_queue(event_key,kind,entity_id,inquiry_id,payload,before_hash,after_hash)
 values(key,kind,(n->>'id')::uuid,target,p,first_hash,last_hash)
 on conflict(event_key) do update set
 payload=excluded.payload||jsonb_build_object('created',pipeline_feishu_queue.payload->'created','from_status',pipeline_feishu_queue.payload->'from_status','from_validity',pipeline_feishu_queue.payload->'from_validity','from_owner',pipeline_feishu_queue.payload->'from_owner',
 'changed_fields',(select coalesce(jsonb_agg(distinct value),'[]') from jsonb_array_elements((pipeline_feishu_queue.payload->'changed_fields')||(excluded.payload->'changed_fields')))),
 inquiry_id=excluded.inquiry_id,after_hash=excluded.after_hash,
 state=case when pipeline_feishu_queue.before_hash=excluded.after_hash then 'cancelled' else 'pending' end
 returning id into notice;
 insert into private.pipeline_feishu_audit(notice_id,action,details) values(notice,'captured',jsonb_build_object('actor_id',actor_id,'transaction',txid_current()::text,'operation',tg_op));
 return new;
end $$;

notify pgrst,'reload schema';
commit;
