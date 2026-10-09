package dz.sr.units.ui

/** Centres des 58 wilayas (même référentiel que la plateforme) pour le zoom par défaut. */
object Wilayas {
    private val CENTRES = mapOf(
        "01" to doubleArrayOf(27.87, -0.28), "02" to doubleArrayOf(36.16, 1.33),
        "03" to doubleArrayOf(33.80, 2.86), "04" to doubleArrayOf(35.87, 7.11),
        "05" to doubleArrayOf(35.55, 6.17), "06" to doubleArrayOf(36.75, 5.05),
        "07" to doubleArrayOf(34.84, 5.72), "08" to doubleArrayOf(31.61, -2.21),
        "09" to doubleArrayOf(36.47, 2.82), "10" to doubleArrayOf(36.37, 3.90),
        "11" to doubleArrayOf(22.78, 5.52), "12" to doubleArrayOf(35.40, 8.12),
        "13" to doubleArrayOf(34.88, -1.31), "14" to doubleArrayOf(35.37, 1.31),
        "15" to doubleArrayOf(36.71, 4.04), "16" to doubleArrayOf(36.75, 3.04),
        "17" to doubleArrayOf(34.67, 3.26), "18" to doubleArrayOf(36.82, 5.76),
        "19" to doubleArrayOf(36.18, 5.41), "20" to doubleArrayOf(34.83, 0.15),
        "21" to doubleArrayOf(36.87, 6.90), "22" to doubleArrayOf(35.18, -0.63),
        "23" to doubleArrayOf(36.89, 7.75), "24" to doubleArrayOf(36.46, 7.42),
        "25" to doubleArrayOf(36.36, 6.61), "26" to doubleArrayOf(36.26, 2.75),
        "27" to doubleArrayOf(35.93, 0.08), "28" to doubleArrayOf(35.70, 4.54),
        "29" to doubleArrayOf(35.39, 0.14), "30" to doubleArrayOf(31.94, 5.32),
        "31" to doubleArrayOf(35.69, -0.63), "32" to doubleArrayOf(33.68, 1.01),
        "33" to doubleArrayOf(26.48, 8.46), "34" to doubleArrayOf(36.07, 4.76),
        "35" to doubleArrayOf(36.76, 3.47), "36" to doubleArrayOf(36.76, 8.31),
        "37" to doubleArrayOf(27.67, -8.14), "38" to doubleArrayOf(35.60, 1.81),
        "39" to doubleArrayOf(33.35, 6.86), "40" to doubleArrayOf(35.43, 7.14),
        "41" to doubleArrayOf(36.28, 7.95), "42" to doubleArrayOf(36.58, 2.44),
        "43" to doubleArrayOf(36.45, 6.26), "44" to doubleArrayOf(36.26, 1.96),
        "45" to doubleArrayOf(33.26, -0.31), "46" to doubleArrayOf(35.29, -1.14),
        "47" to doubleArrayOf(32.49, 3.67), "48" to doubleArrayOf(35.73, 0.55),
        "49" to doubleArrayOf(29.25, 0.23), "50" to doubleArrayOf(21.32, 0.95),
        "51" to doubleArrayOf(34.43, 5.06), "52" to doubleArrayOf(30.13, -2.17),
        "53" to doubleArrayOf(27.19, 2.48), "54" to doubleArrayOf(19.57, 5.77),
        "55" to doubleArrayOf(33.11, 6.06), "56" to doubleArrayOf(24.55, 9.48),
        "57" to doubleArrayOf(33.96, 5.92), "58" to doubleArrayOf(30.58, 2.88)
    )

    /** [lat, lon] de la wilaya, défaut = centre Algérie. */
    fun centre(codeWilaya: String?): DoubleArray =
        CENTRES[codeWilaya] ?: doubleArrayOf(35.5, 3.0)
}
