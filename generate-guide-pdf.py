#!/usr/bin/env python3
"""
Generate EDUMOVE Guide PDF — Version exportable du guide admin
"""

from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm, cm
from reportlab.lib.colors import HexColor, white, black
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle,
    PageBreak, KeepTogether, HRFlowable
)
from reportlab.lib.enums import TA_LEFT, TA_CENTER, TA_RIGHT
import os

# Colors
NAVY = HexColor('#1a1145')
VIOLET = HexColor('#615ca5')
LINK_COLOR = HexColor('#1a2744')
UCJC_COLOR = HexColor('#96234a')
UE_COLOR = HexColor('#003da5')
GOLD = HexColor('#E3C286')
SUCCESS = HexColor('#2e7d52')
WARNING = HexColor('#e65100')
LIGHT_BG = HexColor('#f8f9ff')
BORDER = HexColor('#e0e0e0')

OUTPUT_DIR = os.path.dirname(os.path.abspath(__file__))
OUTPUT_PATH = os.path.join(OUTPUT_DIR, 'Guide-EDUMOVE-Universites-Partenaires.pdf')

def build_pdf():
    doc = SimpleDocTemplate(
        OUTPUT_PATH,
        pagesize=A4,
        topMargin=20*mm,
        bottomMargin=20*mm,
        leftMargin=18*mm,
        rightMargin=18*mm,
        title='Guide EDUMOVE — Universités Partenaires',
        author='EDUMOVE',
    )

    styles = getSampleStyleSheet()

    # Custom styles
    styles.add(ParagraphStyle(
        'MainTitle', parent=styles['Title'],
        fontSize=24, textColor=NAVY, spaceAfter=4*mm,
        fontName='Helvetica-Bold', alignment=TA_CENTER
    ))
    styles.add(ParagraphStyle(
        'Subtitle', parent=styles['Normal'],
        fontSize=11, textColor=HexColor('#666'),
        alignment=TA_CENTER, spaceAfter=8*mm
    ))
    styles.add(ParagraphStyle(
        'H1', parent=styles['Heading1'],
        fontSize=16, textColor=NAVY, spaceBefore=10*mm, spaceAfter=4*mm,
        fontName='Helvetica-Bold', borderPadding=(0,0,2,0)
    ))
    styles.add(ParagraphStyle(
        'H2', parent=styles['Heading2'],
        fontSize=13, textColor=VIOLET, spaceBefore=6*mm, spaceAfter=3*mm,
        fontName='Helvetica-Bold'
    ))
    styles.add(ParagraphStyle(
        'H3', parent=styles['Heading3'],
        fontSize=11, textColor=HexColor('#333'), spaceBefore=4*mm, spaceAfter=2*mm,
        fontName='Helvetica-Bold'
    ))
    styles.add(ParagraphStyle(
        'Body', parent=styles['Normal'],
        fontSize=9, leading=13, textColor=HexColor('#333'), spaceAfter=2*mm
    ))
    styles.add(ParagraphStyle(
        'SmallNote', parent=styles['Normal'],
        fontSize=8, leading=11, textColor=HexColor('#888'), spaceAfter=2*mm
    ))
    styles.add(ParagraphStyle(
        'BulletItem', parent=styles['Normal'],
        fontSize=9, leading=13, textColor=HexColor('#333'),
        leftIndent=12, spaceAfter=1.5*mm, bulletIndent=0
    ))
    styles.add(ParagraphStyle(
        'HighlightBox', parent=styles['Normal'],
        fontSize=9, leading=13, textColor=WARNING,
        backColor=HexColor('#fff8f0'), borderPadding=8,
        spaceAfter=3*mm, fontName='Helvetica-Bold'
    ))

    story = []

    # ═══════════════════════════════
    # COVER
    # ═══════════════════════════════
    story.append(Spacer(1, 30*mm))
    story.append(Paragraph('GUIDE EDUMOVE', styles['MainTitle']))
    story.append(Paragraph('Universités Partenaires — Études de Santé en Europe', styles['Subtitle']))
    story.append(Spacer(1, 8*mm))
    story.append(HRFlowable(width='60%', thickness=2, color=VIOLET, spaceAfter=8*mm))
    story.append(Paragraph('Document interne — Mars 2026', styles['Subtitle']))
    story.append(Spacer(1, 15*mm))

    # Summary boxes
    summary_data = [
        ['3 Universités', '6 Filières', '3 Pays', '10+ Campus'],
    ]
    summary_table = Table(summary_data, colWidths=[40*mm]*4)
    summary_table.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,-1), VIOLET),
        ('TEXTCOLOR', (0,0), (-1,-1), white),
        ('ALIGN', (0,0), (-1,-1), 'CENTER'),
        ('FONTNAME', (0,0), (-1,-1), 'Helvetica-Bold'),
        ('FONTSIZE', (0,0), (-1,-1), 11),
        ('VALIGN', (0,0), (-1,-1), 'MIDDLE'),
        ('TOPPADDING', (0,0), (-1,-1), 10),
        ('BOTTOMPADDING', (0,0), (-1,-1), 10),
        ('GRID', (0,0), (-1,-1), 1, HexColor('#7a76b8')),
        ('ROUNDEDCORNERS', [6,6,6,6]),
    ]))
    story.append(summary_table)
    story.append(Spacer(1, 10*mm))

    # TOC
    story.append(Paragraph('<b>Sommaire</b>', styles['H2']))
    toc_items = [
        '1. LINK Campus University — Rome (Italie)',
        '2. UCJC — Madrid (Espagne)',
        '3. Universidad Europea — Multi-campus (Espagne)',
        '4. Tableau comparatif général',
        '5. Critères d\'éligibilité par université',
    ]
    for item in toc_items:
        story.append(Paragraph(item, styles['Body']))

    story.append(PageBreak())

    # ═══════════════════════════════
    # 1. LINK
    # ═══════════════════════════════
    story.append(Paragraph('1. LINK Campus University — Rome', styles['H1']))
    story.append(HRFlowable(width='100%', thickness=2, color=LINK_COLOR, spaceAfter=4*mm))

    story.append(Paragraph('<b>Pays :</b> Italie — Rome', styles['Body']))
    story.append(Paragraph('<b>Langue :</b> Italien (pas de prérequis linguistique à l\'inscription)', styles['Body']))
    story.append(Paragraph('<b>Test :</b> QCM en français — 80 questions, ~2h30 — 200€ de frais d\'inscription', styles['Body']))
    story.append(Paragraph('<b>Date du test :</b> 15 avril 2026 — Paris', styles['Body']))
    story.append(Spacer(1, 3*mm))

    # LINK pricing table
    link_data = [
        ['Filière', 'Tarif/an', 'Durée', 'Coût total', 'Test'],
        ['Médecine', '19 800 €', '6 ans', '118 800 €', 'Oui — QCM FR (200€)'],
        ['Dentaire', '19 800 €', '6 ans', '118 800 €', 'Oui — QCM FR (200€)'],
        ['Kinésithérapie', '11 900 €', '3 ans', '35 700 €', 'Oui — QCM FR (200€)'],
        ['Pharmacie', '7 900 €', '5 ans', '39 500 €', 'NON — sur dossier'],
    ]
    link_table = Table(link_data, colWidths=[32*mm, 24*mm, 18*mm, 26*mm, 40*mm])
    link_table.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,0), LINK_COLOR),
        ('TEXTCOLOR', (0,0), (-1,0), white),
        ('FONTNAME', (0,0), (-1,0), 'Helvetica-Bold'),
        ('FONTSIZE', (0,0), (-1,-1), 8),
        ('ALIGN', (1,0), (-1,-1), 'CENTER'),
        ('ALIGN', (0,0), (0,-1), 'LEFT'),
        ('VALIGN', (0,0), (-1,-1), 'MIDDLE'),
        ('GRID', (0,0), (-1,-1), 0.5, BORDER),
        ('TOPPADDING', (0,0), (-1,-1), 5),
        ('BOTTOMPADDING', (0,0), (-1,-1), 5),
        ('ROWBACKGROUNDS', (0,1), (-1,-1), [white, LIGHT_BG]),
        ('FONTNAME', (0,1), (0,-1), 'Helvetica-Bold'),
    ]))
    story.append(link_table)
    story.append(Spacer(1, 4*mm))

    # LINK Test details
    story.append(Paragraph('Format du test LINK', styles['H3']))
    story.append(Paragraph('QCM de 80 questions réparties en 5 matières, entièrement en français :', styles['Body']))
    test_items = [
        '<b>Biologie</b> (20 questions) — biologie cellulaire, génétique, anatomie humaine',
        '<b>Chimie</b> (20 questions) — chimie générale, organique, biochimie',
        '<b>Mathématiques</b> (10 questions) — probabilités, stats, raisonnement logique',
        '<b>Physique</b> (10 questions) — mécanique, optique, thermodynamique',
        '<b>Culture générale</b> (20 questions) — actualité scientifique et médicale',
    ]
    for item in test_items:
        story.append(Paragraph(f'• {item}', styles['BulletItem']))
    story.append(Paragraph('<b>Barème :</b> +1,5 point par bonne réponse, -0,4 par mauvaise réponse. Pas de pénalité si pas de réponse.', styles['SmallNote']))

    # LINK Documents
    story.append(Paragraph('Documents requis — LINK', styles['H3']))
    link_docs = [
        '<b>Formulaire de pré-candidature</b> (manuscrit)',
        '<b>Pièce d\'identité</b> (scan recto-verso)',
        '<b>Relevé de notes du bac</b> (optionnel à la candidature)',
    ]
    for d in link_docs:
        story.append(Paragraph(f'• {d}', styles['BulletItem']))
    story.append(Paragraph('Après acceptation : diplôme du bac, photo, certificat médical, Dichiarazione di Valore (reconnaissance italienne du bac français).', styles['SmallNote']))

    # LINK Notes
    story.append(Paragraph('<b>Points clés LINK :</b>', styles['H3']))
    story.append(Paragraph('• Pharmacie : seule filière sans test (admission sur dossier uniquement)', styles['BulletItem']))
    story.append(Paragraph('• Les étudiants de Terminale peuvent candidater avant d\'avoir le bac', styles['BulletItem']))
    story.append(Paragraph('• Kiné en 3 ans (vs 5 en France) — pratique dès la 1ère année', styles['BulletItem']))
    story.append(Paragraph('• Diplôme reconnu dans toute l\'UE', styles['BulletItem']))
    story.append(Paragraph('• Pas de vétérinaire à LINK', styles['BulletItem']))

    story.append(PageBreak())

    # ═══════════════════════════════
    # 2. UCJC
    # ═══════════════════════════════
    story.append(Paragraph('2. UCJC — Universidad Camilo José Cela', styles['H1']))
    story.append(HRFlowable(width='100%', thickness=2, color=UCJC_COLOR, spaceAfter=4*mm))

    story.append(Paragraph('<b>Pays :</b> Espagne — Madrid', styles['Body']))
    story.append(Paragraph('<b>Langue :</b> 100% espagnol', styles['Body']))
    story.append(Paragraph('<b>Test :</b> Pas de test écrit — entretien de motivation', styles['Body']))
    story.append(Paragraph('<b>Frais de test :</b> 0€', styles['Body']))
    story.append(Spacer(1, 3*mm))

    story.append(Paragraph('<font color="#e65100"><b>ATTENTION : Médecine COMPLET pour 2026-2027 — plus aucune place disponible.</b></font>', styles['Body']))
    story.append(Spacer(1, 3*mm))

    # UCJC pricing table
    ucjc_data = [
        ['Filière', 'Tarif/an', 'Durée', 'Coût total', 'Admission', 'Statut'],
        ['Médecine', '19 920 €', '6 ans', '119 520 €', 'Entretien', 'COMPLET'],
        ['Dentaire', '18 420 €', '5 ans', '92 100 €', 'Entretien', 'Ouvert'],
        ['Pharmacie', '10 140 €', '5 ans', '50 700 €', 'Entretien', 'Ouvert'],
        ['Kinésithérapie', '9 420 €', '4 ans', '37 680 €', 'Entretien', 'Ouvert'],
    ]
    ucjc_table = Table(ucjc_data, colWidths=[28*mm, 22*mm, 16*mm, 24*mm, 22*mm, 22*mm])
    ucjc_table.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,0), UCJC_COLOR),
        ('TEXTCOLOR', (0,0), (-1,0), white),
        ('FONTNAME', (0,0), (-1,0), 'Helvetica-Bold'),
        ('FONTSIZE', (0,0), (-1,-1), 8),
        ('ALIGN', (1,0), (-1,-1), 'CENTER'),
        ('ALIGN', (0,0), (0,-1), 'LEFT'),
        ('VALIGN', (0,0), (-1,-1), 'MIDDLE'),
        ('GRID', (0,0), (-1,-1), 0.5, BORDER),
        ('TOPPADDING', (0,0), (-1,-1), 5),
        ('BOTTOMPADDING', (0,0), (-1,-1), 5),
        ('ROWBACKGROUNDS', (0,1), (-1,-1), [white, LIGHT_BG]),
        ('FONTNAME', (0,1), (0,-1), 'Helvetica-Bold'),
        ('TEXTCOLOR', (5,1), (5,1), HexColor('#c62828')),
        ('FONTNAME', (5,1), (5,1), 'Helvetica-Bold'),
    ]))
    story.append(ucjc_table)
    story.append(Spacer(1, 4*mm))

    # UCJC Documents
    story.append(Paragraph('Documents requis — UCJC', styles['H3']))
    ucjc_docs = [
        '<b>Formulaire UCJC</b> (PDF à remplir)',
        '<b>Lettre de motivation en espagnol</b> (toujours requise)',
        '<b>Pièce d\'identité</b> (scan recto-verso)',
        '<b>Attestation de niveau d\'espagnol</b> (certificat non officiel accepté)',
    ]
    for d in ucjc_docs:
        story.append(Paragraph(f'• {d}', styles['BulletItem']))
    story.append(Paragraph('Après soumission : entretien (possible en visio), diplôme du bac, relevé de notes, certificat médical, homologation.', styles['SmallNote']))

    # UCJC Notes
    story.append(Paragraph('<b>Points clés UCJC :</b>', styles['H3']))
    story.append(Paragraph('• Pas de test écrit — l\'admission se fait par entretien de motivation', styles['BulletItem']))
    story.append(Paragraph('• L\'attestation d\'espagnol peut être informelle (pas besoin de DELE officiel)', styles['BulletItem']))
    story.append(Paragraph('• L\'entretien peut se faire en visioconférence', styles['BulletItem']))
    story.append(Paragraph('• Kiné UCJC : option la moins chère toutes universités confondues (9 420€/an)', styles['BulletItem']))
    story.append(Paragraph('• Dentaire : 2 spécialités scientifiques requises', styles['BulletItem']))
    story.append(Paragraph('• Pas de vétérinaire à l\'UCJC', styles['BulletItem']))

    story.append(PageBreak())

    # ═══════════════════════════════
    # 3. UNIVERSIDAD EUROPEA
    # ═══════════════════════════════
    story.append(Paragraph('3. Universidad Europea — Multi-campus', styles['H1']))
    story.append(HRFlowable(width='100%', thickness=2, color=UE_COLOR, spaceAfter=4*mm))

    story.append(Paragraph('<b>Pays :</b> Espagne — 5 campus (Madrid, Malaga, Valence, Alicante, Canaries)', styles['Body']))
    story.append(Paragraph('<b>Langues :</b> Espagnol, Anglais ou Français selon campus et filière', styles['Body']))
    story.append(Paragraph('<b>Test :</b> PE (Prueba de Evaluación) — 4 épreuves', styles['Body']))
    story.append(Paragraph('<b>Acompte après acceptation :</b> 2 500€ sous 2 jours', styles['Body']))
    story.append(Spacer(1, 3*mm))

    # UE FULL pricing table
    ue_data = [
        ['Filière', 'Campus', 'Tarif/an', 'Durée', 'Langues', 'Test', 'Moy. min.'],
        ['Médecine (PE)', 'Madrid', '21 480 €', '6 ans', 'Espagnol', 'Oui', '16-17/20'],
        ['', 'Canaries', '18 900 €', '6 ans', 'Espagnol (B2)', 'Oui — PE', '16-17/20'],
        ['Dentaire (PE)', 'Madrid', '20 820 €', '5 ans', 'ES, EN', 'Oui', '15-16/20'],
        ['', 'Malaga', '19 200 €', '5 ans', 'ES, EN', 'Oui', '15-16/20'],
        ['', 'Valence', '20 821 €', '5 ans', 'ES, EN', 'Oui', '15-16/20'],
        ['', 'Alicante', '20 821 €', '5 ans', 'ES, EN', 'Oui', '15-16/20'],
        ['', 'Canaries', '16 900 €', '5 ans', 'ES seul (B2)', 'Oui — PE', '15-16/20'],
        ['Kiné (Hors PE)', 'Madrid', '10 020 €', '4 ans', 'FR, ES, EN', 'FR seul.', '13-14/20'],
        ['', 'Malaga', '10 020 €', '4 ans', 'Espagnol', 'Non', '13-14/20'],
        ['', 'Valence', '10 080 €', '4 ans', 'Espagnol', 'Non', '13-14/20'],
        ['', 'Alicante', '10 080 €', '4 ans', 'Espagnol', 'Non', '13-14/20'],
        ['', 'Canaries', '9 780 €', '4 ans', 'ES (B2)', 'Non', '13-14/20'],
        ['Pharmacie', 'Madrid', '12 120 €', '5 ans', 'Espagnol', 'Non', '/'],
        ['Vétérinaire', 'Madrid', '19 500 €', '5 ans', 'Espagnol', 'Oui — PE', '14-15/20'],
        ['Prépa Dent.', 'Alicante', '17 000 €', '1+5 ans', 'Anglais (B2)', 'Non', '/'],
    ]
    ue_table = Table(ue_data, colWidths=[26*mm, 20*mm, 20*mm, 16*mm, 22*mm, 18*mm, 18*mm])
    ue_table.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,0), UE_COLOR),
        ('TEXTCOLOR', (0,0), (-1,0), white),
        ('FONTNAME', (0,0), (-1,0), 'Helvetica-Bold'),
        ('FONTSIZE', (0,0), (-1,-1), 7),
        ('LEADING', (0,0), (-1,-1), 9),
        ('ALIGN', (1,0), (-1,-1), 'CENTER'),
        ('ALIGN', (0,0), (0,-1), 'LEFT'),
        ('VALIGN', (0,0), (-1,-1), 'MIDDLE'),
        ('GRID', (0,0), (-1,-1), 0.5, BORDER),
        ('TOPPADDING', (0,0), (-1,-1), 4),
        ('BOTTOMPADDING', (0,0), (-1,-1), 4),
        ('FONTNAME', (0,1), (0,-1), 'Helvetica-Bold'),
        # Canaries rows highlight
        ('BACKGROUND', (0,2), (-1,2), HexColor('#fff8e1')),
        ('BACKGROUND', (0,7), (-1,7), HexColor('#fff8e1')),
        ('BACKGROUND', (0,12), (-1,12), HexColor('#fff8e1')),
        # Prepa row
        ('BACKGROUND', (0,15), (-1,15), HexColor('#eff6ff')),
        # Span filière names
        ('SPAN', (0,1), (0,2)),   # Médecine
        ('SPAN', (0,3), (0,7)),   # Dentaire
        ('SPAN', (0,8), (0,12)),  # Kiné
    ]))
    story.append(ue_table)
    story.append(Spacer(1, 2*mm))

    story.append(Paragraph('<b>PE</b> = Prueba de Evaluación (test obligatoire) · <b>Hors PE</b> = sans test.', styles['SmallNote']))
    story.append(Paragraph('2 spécialités scientifiques requises pour Médecine, Dentaire et Vétérinaire.', styles['SmallNote']))
    story.append(Paragraph('Kiné FR Madrid : 1ère année en français, puis espagnol dès la 2ème année.', styles['SmallNote']))
    story.append(Paragraph('<font color="#e65100"><b>Canaries : toutes les filières 100% espagnol, B2 espagnol obligatoire. Médecine et Dentaire : tests PE classiques. Kiné : Hors PE mais B2 requis. Tarifs plus avantageux.</b></font>', styles['SmallNote']))

    story.append(Spacer(1, 4*mm))

    # UE Test details
    story.append(Paragraph('Test PE — 4 épreuves', styles['H3']))
    pe_items = [
        '<b>Test de langue</b> — adapté à la langue du cursus (espagnol, anglais ou français)',
        '<b>Test de talent / aptitudes</b> — raisonnement logique, aptitudes cognitives',
        '<b>Test de motivation</b> — entretien individuel + questionnaire de personnalité',
        '<b>Épreuve spécifique</b> — contenu adapté à la filière (biologie, anatomie...)',
    ]
    for item in pe_items:
        story.append(Paragraph(f'• {item}', styles['BulletItem']))
    story.append(Paragraph('Résultats sous 48h par email. En cas d\'acceptation : 2 jours pour verser l\'acompte de 2 500€.', styles['SmallNote']))

    # UE Sessions
    story.append(Paragraph('Sessions de test 2026', styles['H3']))

    # Médecine sessions
    story.append(Paragraph('<b>Sessions Médecine (Madrid + Canaries) :</b>', styles['Body']))
    med_sessions = [
        ['Session', 'Inscription', 'Tests', 'Résultats'],
        ['1ère (passée)', '09/12/2025', '15/12/2025', '22/12/2025'],
        ['2ème (passée)', '16/02/2026', '19/02/2026', '26/02/2026'],
        ['3ème (prochaine)', '17/04/2026', '22/04/2026', '29/04/2026'],
        ['4ème', '18/05/2026', '21/05/2026', '28/05/2026'],
        ['5ème', '06/07/2026', '08/07/2026', '15/07/2026'],
    ]
    med_table = Table(med_sessions, colWidths=[35*mm]*4)
    med_table.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,0), UE_COLOR),
        ('TEXTCOLOR', (0,0), (-1,0), white),
        ('FONTNAME', (0,0), (-1,0), 'Helvetica-Bold'),
        ('FONTSIZE', (0,0), (-1,-1), 8),
        ('ALIGN', (0,0), (-1,-1), 'CENTER'),
        ('GRID', (0,0), (-1,-1), 0.5, BORDER),
        ('TOPPADDING', (0,0), (-1,-1), 4),
        ('BOTTOMPADDING', (0,0), (-1,-1), 4),
        ('TEXTCOLOR', (0,1), (-1,2), HexColor('#999')),
        ('BACKGROUND', (0,3), (-1,3), HexColor('#e8f5e9')),
    ]))
    story.append(med_table)
    story.append(Spacer(1, 3*mm))

    # Dentaire/Kiné/Véto sessions
    story.append(Paragraph('<b>Sessions Dentaire / Kiné / Véto :</b>', styles['Body']))
    dent_sessions = [
        ['Inscription', 'Tests', 'Résultats'],
        ['04/12/2025 (passée)', '10/12/2025', '12/12/2025'],
        ['09/01/2026 (passée)', '14/01/2026', '16/01/2026'],
        ['05/02/2026 (passée)', '10/02/2026', '12/02/2026'],
        ['05/03/2026 (passée)', '10/03/2026', '12/03/2026'],
        ['16/04/2026 (prochaine)', '21/04/2026', '23/04/2026'],
        ['08/05/2026', '12/05/2026', '14/05/2026'],
        ['08/06/2026', '11/06/2026', '13/06/2026'],
        ['15/07/2026', '21/07/2026', '23/07/2026'],
    ]
    dent_table = Table(dent_sessions, colWidths=[46*mm]*3)
    dent_table.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,0), UE_COLOR),
        ('TEXTCOLOR', (0,0), (-1,0), white),
        ('FONTNAME', (0,0), (-1,0), 'Helvetica-Bold'),
        ('FONTSIZE', (0,0), (-1,-1), 8),
        ('ALIGN', (0,0), (-1,-1), 'CENTER'),
        ('GRID', (0,0), (-1,-1), 0.5, BORDER),
        ('TOPPADDING', (0,0), (-1,-1), 4),
        ('BOTTOMPADDING', (0,0), (-1,-1), 4),
        ('TEXTCOLOR', (0,1), (-1,4), HexColor('#999')),
        ('BACKGROUND', (0,5), (-1,5), HexColor('#e8f5e9')),
    ]))
    story.append(dent_table)
    story.append(Spacer(1, 4*mm))

    # UE Documents
    story.append(Paragraph('Documents requis — UE', styles['H3']))
    story.append(Paragraph('<b>Documents candidature Edumove :</b>', styles['Body']))
    ue_docs = [
        '<b>3 bulletins de Première</b> (fusionnés en 1 PDF)',
        '<b>Pièce d\'identité</b> (carte d\'identité ou passeport)',
        '<b>Rapport technique académique</b> (60€ via hostudents.com)',
    ]
    for d in ue_docs:
        story.append(Paragraph(f'• {d}', styles['BulletItem']))
    story.append(Spacer(1, 2*mm))
    story.append(Paragraph('<b>Documents demandés par l\'université après soumission :</b>', styles['Body']))
    ue_post_docs = [
        'Diplôme du baccalauréat (ou attestation de réussite)',
        'Relevé de notes du bac',
        'Photo d\'identité format numérique',
        'Certificat médical',
        '<b>Attestation B2</b> dans la langue de la filière visée',
    ]
    for d in ue_post_docs:
        story.append(Paragraph(f'• {d}', styles['BulletItem']))

    # Who takes PE test
    story.append(Paragraph('Qui doit passer le test PE ?', styles['H3']))
    pe_who = [
        ['Filière', 'Test requis ?', 'Détails'],
        ['Médecine', 'OUI — PE obligatoire', 'Madrid + Canaries. B2 espagnol Canaries.'],
        ['Dentaire', 'OUI — PE obligatoire', '5 campus. B2 espagnol Canaries.'],
        ['Vétérinaire', 'OUI — PE obligatoire', 'Madrid uniquement.'],
        ['Kiné FR Madrid', 'OUI — exception', 'Cursus FR avec test PE.'],
        ['Kiné (autres)', 'NON — Hors PE', 'Admission sur dossier. B2 ES Canaries.'],
        ['Pharmacie', 'NON — Hors PE', 'Madrid uniquement. Sur dossier.'],
        ['Prépa Dentaire', 'NON — Hors PE', 'Alicante. B2 anglais requis.'],
    ]
    pe_table = Table(pe_who, colWidths=[30*mm, 35*mm, 75*mm])
    pe_table.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,0), UE_COLOR),
        ('TEXTCOLOR', (0,0), (-1,0), white),
        ('FONTNAME', (0,0), (-1,0), 'Helvetica-Bold'),
        ('FONTSIZE', (0,0), (-1,-1), 8),
        ('ALIGN', (0,0), (-1,-1), 'LEFT'),
        ('GRID', (0,0), (-1,-1), 0.5, BORDER),
        ('TOPPADDING', (0,0), (-1,-1), 4),
        ('BOTTOMPADDING', (0,0), (-1,-1), 4),
        ('FONTNAME', (0,1), (0,-1), 'Helvetica-Bold'),
        ('TEXTCOLOR', (1,1), (1,3), HexColor('#c62828')),
        ('TEXTCOLOR', (1,4), (1,4), WARNING),
        ('TEXTCOLOR', (1,5), (1,7), SUCCESS),
        ('FONTNAME', (1,1), (1,-1), 'Helvetica-Bold'),
    ]))
    story.append(pe_table)

    story.append(PageBreak())

    # ═══════════════════════════════
    # 4. COMPARATIF
    # ═══════════════════════════════
    story.append(Paragraph('4. Tableau comparatif général', styles['H1']))
    story.append(HRFlowable(width='100%', thickness=2, color=NAVY, spaceAfter=4*mm))

    comp_data = [
        ['', 'LINK (Rome)', 'UCJC (Madrid)', 'UE (Multi-campus)'],
        ['Pays', 'Italie', 'Espagne', 'Espagne'],
        ['Campus', 'Rome', 'Madrid', '5 campus'],
        ['Langue', 'Italien', 'Espagnol', 'ES, EN, FR'],
        ['Test', 'QCM FR (200€)', 'Entretien (0€)', 'PE 4 épreuves'],
        ['Médecine', '19 800€ (6a)', 'COMPLET', '18 900-21 480€ (6a)'],
        ['Dentaire', '19 800€ (6a)', '18 420€ (5a)', '16 900-20 821€ (5a)'],
        ['Kiné', '11 900€ (3a)', '9 420€ (4a)', '9 780-10 080€ (4a)'],
        ['Pharmacie', '7 900€ (5a)', '10 140€ (5a)', '12 120€ (5a)'],
        ['Vétérinaire', '—', '—', '19 500€ (5a)'],
        ['Prépa Dent.', '—', '—', '17 000€ (1a)'],
    ]
    comp_table = Table(comp_data, colWidths=[26*mm, 38*mm, 36*mm, 42*mm])
    comp_table.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,0), NAVY),
        ('TEXTCOLOR', (0,0), (-1,0), white),
        ('BACKGROUND', (0,1), (0,-1), HexColor('#f0f0f5')),
        ('FONTNAME', (0,0), (-1,0), 'Helvetica-Bold'),
        ('FONTNAME', (0,1), (0,-1), 'Helvetica-Bold'),
        ('FONTSIZE', (0,0), (-1,-1), 8),
        ('ALIGN', (0,0), (-1,-1), 'CENTER'),
        ('VALIGN', (0,0), (-1,-1), 'MIDDLE'),
        ('GRID', (0,0), (-1,-1), 0.5, BORDER),
        ('TOPPADDING', (0,0), (-1,-1), 5),
        ('BOTTOMPADDING', (0,0), (-1,-1), 5),
        # LINK column header
        ('BACKGROUND', (1,0), (1,0), LINK_COLOR),
        ('BACKGROUND', (2,0), (2,0), UCJC_COLOR),
        ('BACKGROUND', (3,0), (3,0), UE_COLOR),
        # COMPLET cell
        ('TEXTCOLOR', (2,5), (2,5), HexColor('#c62828')),
        ('FONTNAME', (2,5), (2,5), 'Helvetica-Bold'),
    ]))
    story.append(comp_table)
    story.append(Spacer(1, 6*mm))

    # Options les moins chères par filière
    story.append(Paragraph('Options les moins chères par filière', styles['H3']))
    cheap_data = [
        ['Filière', 'Option la moins chère', 'Tarif/an', 'Coût total'],
        ['Médecine', 'UE Canaries', '18 900 €/an', '113 400 € (6a)'],
        ['Dentaire', 'UE Canaries', '16 900 €/an', '84 500 € (5a)'],
        ['Kiné', 'UCJC Madrid', '9 420 €/an', '37 680 € (4a)'],
        ['Pharmacie', 'LINK Rome', '7 900 €/an', '39 500 € (5a)'],
        ['Vétérinaire', 'UE Madrid (seule)', '19 500 €/an', '97 500 € (5a)'],
    ]
    cheap_table = Table(cheap_data, colWidths=[28*mm, 38*mm, 28*mm, 34*mm])
    cheap_table.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,0), SUCCESS),
        ('TEXTCOLOR', (0,0), (-1,0), white),
        ('FONTNAME', (0,0), (-1,0), 'Helvetica-Bold'),
        ('FONTSIZE', (0,0), (-1,-1), 8),
        ('ALIGN', (0,0), (-1,-1), 'CENTER'),
        ('GRID', (0,0), (-1,-1), 0.5, BORDER),
        ('TOPPADDING', (0,0), (-1,-1), 5),
        ('BOTTOMPADDING', (0,0), (-1,-1), 5),
        ('FONTNAME', (0,1), (0,-1), 'Helvetica-Bold'),
        ('ROWBACKGROUNDS', (0,1), (-1,-1), [white, LIGHT_BG]),
    ]))
    story.append(cheap_table)

    story.append(PageBreak())

    # ═══════════════════════════════
    # 5. CRITERES D'ELIGIBILITE
    # ═══════════════════════════════
    story.append(Paragraph('5. Critères d\'éligibilité par université', styles['H1']))
    story.append(HRFlowable(width='100%', thickness=2, color=NAVY, spaceAfter=4*mm))

    # LINK eligibility
    story.append(Paragraph('LINK Campus — Éligibilité', styles['H2']))
    story.append(Paragraph('• <b>Aucune moyenne minimum requise</b> — tous les profils sont acceptés', styles['BulletItem']))
    story.append(Paragraph('• <b>Aucun prérequis linguistique</b> — les cours sont en italien mais aucun niveau n\'est demandé à l\'inscription', styles['BulletItem']))
    story.append(Paragraph('• <b>Pas de vétérinaire</b> à LINK', styles['BulletItem']))
    story.append(Paragraph('• <b>Pharmacie sans test</b> — admission sur dossier uniquement', styles['BulletItem']))

    # UCJC eligibility
    story.append(Paragraph('UCJC — Éligibilité', styles['H2']))
    story.append(Paragraph('• <b>Dentaire</b> : 2 spécialités scientifiques en Terminale requises', styles['BulletItem']))
    story.append(Paragraph('• <b>Médecine</b> : COMPLET pour 2026-2027 (plus de places)', styles['BulletItem']))
    story.append(Paragraph('• <b>Pas de vétérinaire</b> à l\'UCJC', styles['BulletItem']))
    story.append(Paragraph('• <b>Kiné et Pharmacie</b> : ouverts à tous les profils, pas de moyenne minimum', styles['BulletItem']))
    story.append(Paragraph('• <b>Espagnol</b> : attestation demandée (non officielle acceptée)', styles['BulletItem']))

    # UE eligibility
    story.append(Paragraph('Universidad Europea — Éligibilité', styles['H2']))

    ue_elig = [
        ['Filière', 'Moy. spé sci min.', '2 spé sci ?', 'Langue requise'],
        ['Médecine', '16-17/20', 'OUI', 'Espagnol'],
        ['Dentaire', '15-16/20', 'OUI', 'ES ou EN (ES seul Canaries)'],
        ['Vétérinaire', '14-15/20', 'OUI', 'Espagnol'],
        ['Kinésithérapie', '13-14/20', 'NON', 'FR, ES ou EN (ES Canaries)'],
        ['Pharmacie', 'Aucune', 'NON', 'Espagnol'],
        ['Prépa Dentaire', 'Aucune', 'NON', 'Anglais B2 requis'],
    ]
    ue_elig_table = Table(ue_elig, colWidths=[30*mm, 30*mm, 22*mm, 52*mm])
    ue_elig_table.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,0), UE_COLOR),
        ('TEXTCOLOR', (0,0), (-1,0), white),
        ('FONTNAME', (0,0), (-1,0), 'Helvetica-Bold'),
        ('FONTSIZE', (0,0), (-1,-1), 8),
        ('ALIGN', (0,0), (-1,-1), 'CENTER'),
        ('ALIGN', (0,1), (0,-1), 'LEFT'),
        ('GRID', (0,0), (-1,-1), 0.5, BORDER),
        ('TOPPADDING', (0,0), (-1,-1), 5),
        ('BOTTOMPADDING', (0,0), (-1,-1), 5),
        ('FONTNAME', (0,1), (0,-1), 'Helvetica-Bold'),
        ('ROWBACKGROUNDS', (0,1), (-1,-1), [white, LIGHT_BG]),
    ]))
    story.append(ue_elig_table)
    story.append(Spacer(1, 3*mm))

    story.append(Paragraph('<font color="#e65100"><b>Canaries — Règles spécifiques :</b></font>', styles['Body']))
    story.append(Paragraph('• Toutes les filières sont 100% en espagnol — <b>B2 espagnol obligatoire</b>', styles['BulletItem']))
    story.append(Paragraph('• Médecine et Dentaire : tests PE classiques (4 épreuves)', styles['BulletItem']))
    story.append(Paragraph('• Kinésithérapie : Hors PE mais B2 espagnol toujours requis', styles['BulletItem']))
    story.append(Paragraph('• Tarifs plus avantageux que les autres campus', styles['BulletItem']))

    story.append(Spacer(1, 10*mm))
    story.append(HRFlowable(width='40%', thickness=1, color=BORDER, spaceAfter=4*mm))
    story.append(Paragraph('<i>Document généré automatiquement — EDUMOVE — Mars 2026</i>', styles['SmallNote']))

    # BUILD
    doc.build(story)
    print(f'PDF generated: {OUTPUT_PATH}')
    return OUTPUT_PATH

if __name__ == '__main__':
    build_pdf()
