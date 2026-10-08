package dz.carfleet.device.ui

/** Listes fermées (listbox) pour éviter les saisies erronées. */
object Ref {
    val MARQUES = linkedMapOf(
        "Renault" to listOf("Symbol", "Clio", "Megane", "Duster", "Kangoo"),
        "Peugeot" to listOf("208", "301", "308", "Partner", "Expert"),
        "Hyundai" to listOf("Accent", "i10", "i20", "Tucson", "H1"),
        "Toyota" to listOf("Yaris", "Corolla", "Hilux", "Hiace", "Land Cruiser"),
        "Volkswagen" to listOf("Polo", "Golf", "Caddy", "Transporter"),
        "Dacia" to listOf("Logan", "Sandero", "Dokker", "Duster"),
        "Kia" to listOf("Picanto", "Rio", "Sportage", "Carnival"),
        "Seat" to listOf("Ibiza", "Leon", "Arona"),
        "Chevrolet" to listOf("Aveo", "Cruze", "Spark"),
        "Fiat" to listOf("Punto", "Tipo", "Doblo", "Ducato")
    )

    val COULEURS = listOf("Blanc", "Noir", "Gris", "Argent", "Bleu", "Rouge", "Beige", "Vert", "Marron")

    val WILAYAS = listOf(
        "01 - Adrar", "02 - Chlef", "03 - Laghouat", "04 - Oum El Bouaghi",
        "05 - Batna", "06 - Bejaia", "07 - Biskra", "08 - Bechar",
        "09 - Blida", "10 - Bouira", "11 - Tamanrasset", "12 - Tebessa",
        "13 - Tlemcen", "14 - Tiaret", "15 - Tizi Ouzou", "16 - Alger",
        "17 - Djelfa", "18 - Jijel", "19 - Setif", "20 - Saida",
        "21 - Skikda", "22 - Sidi Bel Abbes", "23 - Annaba", "24 - Guelma",
        "25 - Constantine", "26 - Medea", "27 - Mostaganem", "28 - M'Sila",
        "29 - Mascara", "30 - Ouargla", "31 - Oran", "32 - El Bayadh",
        "33 - Illizi", "34 - Bordj Bou Arreridj", "35 - Boumerdes", "36 - El Tarf",
        "37 - Tindouf", "38 - Tissemsilt", "39 - El Oued", "40 - Khenchela",
        "41 - Souk Ahras", "42 - Tipaza", "43 - Mila", "44 - Ain Defla",
        "45 - Naama", "46 - Ain Temouchent", "47 - Ghardaia", "48 - Relizane",
        "49 - Timimoun", "50 - Bordj Badji Mokhtar", "51 - Ouled Djellal", "52 - Beni Abbes",
        "53 - In Salah", "54 - In Guezzam", "55 - Touggourt", "56 - Djanet",
        "57 - El M'Ghair", "58 - El Meniaa"
    )

    fun wilayaName(code: String): String =
        WILAYAS.find { it.startsWith(code) }?.substringAfter("- ") ?: code
}
