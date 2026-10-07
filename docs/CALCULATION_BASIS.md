# Calculation Basis

## Purpose

AirFlow Select는 산업용 Blow-off 공정의 **초기 블로워 Duty Point**를 빠르게 산정하기 위한 단순화 계산기입니다. 최종 설계/구매용 CFD 또는 제조사 선정 프로그램을 대체하지 않습니다.

## 1. Air density

```text
ρ = P / (R · T)
R = 287.05 J/(kg·K)
```

사용자가 입력한 공기 온도와 주변 절대압을 기준으로 밀도를 계산합니다.

## 2. Geometric opening area

```text
Multi-hole: A = n · πd²/4
Slot:       A = n · L · g
Rectangle:  A = n · W · H
Round:      A = n · πd²/4
Custom:     A = user input area
```

여러 노즐 Ass'y가 병렬 운전되면 전체 개구 면적은 Ass'y 수량만큼 합산합니다.

## 3. Velocity-basis calculation

사용자가 목표 등가 출구 풍속 `V`를 지정할 때:

```text
Q = A · V
q = 1/2 · ρ · V²
ΔP_nozzle = 1/2 · ρ · (V/Cd)²
```

`Cd`는 노즐 형상, 수축 및 방출 특성을 단순화하여 반영하는 보정계수입니다.

## 4. Pressure-basis calculation

사용자가 노즐 차압 `ΔP_nozzle`을 지정할 때:

```text
V = Cd · √(2 · ΔP_nozzle / ρ)
Q = A · V
```

## 5. Blower duty point

```text
Q_design = Q · (1 + Flow Margin)
P_design = (ΔP_nozzle + ΔP_system) · (1 + Pressure Margin)
```

동일 노즐을 병렬로 추가하면 풍량은 합산되지만 동일한 분배 조건에서 노즐 자체 요구 차압은 그대로라는 가정을 사용합니다.

## 6. Power estimate

```text
Air Power = ΔP · Q
Shaft Power ≈ Air Power / η
Recommended Motor Requirement = Shaft Power · (1 + Motor Margin)
```

웹 UI는 계산 요구값보다 큰 일반적인 표준 모터 프레임을 함께 표시합니다.

## 7. Removal presets

제거 강도 프리셋은 **공인 청결도 표준이 아닙니다.** 도금/세정/Blow-off 공정에서 초기 시험점을 빠르게 설정하기 위한 경험적 범위입니다.

| Level | Initial velocity range | Typical target |
| --- | ---: | --- |
| 1 | 15–25 m/s | Loose dust / preliminary drying |
| 2 | 25–40 m/s | General water droplets |
| 3 | 40–55 m/s | Water film / stronger rinse water |
| 4 | 45–65 m/s | Chips / scale / heavier debris |
| 5 | 55–80 m/s | Viscous liquid / strong removal |

현장 시험으로 조정해야 하며, 노즐-대상 거리, 각도, 라인 속도, 액체 물성, 표면 형상, 이물 부착력에 따라 결과가 달라집니다.

## 8. Final blower selection

카탈로그의 최대 풍량과 최대 압력은 보통 동시에 발생하지 않습니다. 최종 블로워 모델은 제조사의 **P–Q 성능곡선에서 요구 풍량과 요구 압력을 동시에 만족하는 운전점**을 확인해야 합니다.

## References

- Kaeser Compressors, “Blowers for air knives” — https://pr.kaeser.com/en/compressed-air-resources/kaeser-talks-shop/blowers-for-air-knives.aspx
- Atlas Copco, “Compressed Air Manual, 9th edition”, nozzle gas-flow section — https://www.atlascopco.com/content/dam/atlas-copco/local-countries/greece/documents/mechanical-electrical-contractors/Compressed%20Air%20Manual%209th%20edition1.pdf
