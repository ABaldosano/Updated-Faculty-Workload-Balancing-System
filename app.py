from flask import Flask, jsonify, request
from flask_cors import CORS
import threading
import random
from threading import Lock
import time
import copy
import requests

random.seed(42)

OLLAMA_URL = "http://localhost:11434/api/generate"

def get_ai_specialization(subject_name):
    try:
        response = requests.post(
            OLLAMA_URL,
            json={
                "model": "llama3",
                "prompt": f"Give the best IT specialization for the subject: {subject_name}. Answer as comma separated list only.",
                "stream": False
            },
            timeout=60  # TIMEOUT
        )

        if response.status_code != 200:
            print(f"AI ERROR: {response.status_code}")
            return None

        data = response.json()
        text = data.get("response", "").strip()

        print(f"AI RESPONSE for {subject_name}: {text}")

        if not text:
            return None

        return text

    except Exception as e:
        print("AI FAILED:", e)
        return None



app = Flask(__name__)
CORS(app)
ga_lock = Lock()

# ===== Subject ↔ Specialization Mapping =====
specialization_mapping = {
    "Introduction to Computing": ["Computer Science Education"],
    "Computer Programming 1": ["Software Engineering / Programming Languages"],
    "Discrete Mathematics": ["Applied Mathematics / Theoretical Computer Science"],
    "Introduction to Human Computer Interaction": ["Human-Computer Interaction (HCI)"],
    "Computer Programming 2": ["Software Engineering / Programming Languages"],
    "Graphics and Visual Computing": ["Computer Graphics / Visual Computing"],
    "Data Structures and Algorithms": ["Algorithms & Data Structures / Theoretical Computer Science"],
    "IT Elective 1": ["Information Technology (General Elective)"],
    "IT Elective 2": ["Information Technology (General Elective)"],
    "Mathematics for Data Science": ["Data Science / Applied Mathematics"],
    "Information Management 1": ["Information Systems / Database Management"],
    "Quantitative Methods w/ Modelling and Simulation": ["Operations Research / Computational Modelling"],
    "Network Technologies 1": ["Computer Networks"],
    "Integrative Programming Technologies 1": ["Software Engineering / Systems Integration"],
    "Systems Integration and Architecture 1": ["Systems Architecture / Enterprise Systems"],
    "Advanced Database Systems": ["Database Systems / Information Systems"],
    "Network Technologies 2": ["Computer Networks / Network Engineering"],
    "Information Assurance and Security 1": ["Cybersecurity / Information Assurance"],
    "Web Systems and Technologies 1": ["Web Development / Web Technologies"],
    "Multimedia Systems": ["Multimedia Computing / Digital Media"],
    "IT Elective 3": ["Information Technology (General Elective)"],
    "Application Development and Emerging Technologies 1": ["Emerging Technologies / Application Development"],
    "Geographic Information System": ["Geographic Information Systems (GIS)"],
    "Embedded System": ["Embedded Systems Engineering"],
    "Information Assurance and Security 2": ["Cybersecurity / Information Assurance"]
}

subject_specialization_map = {}

def get_specialization(subject_name):
    subject_name = subject_name.strip()

    # 1. Hardcoded FIRST (VERY IMPORTANT)
    if subject_name in specialization_mapping:
        return specialization_mapping[subject_name]

    # 2. Cached AI
    if subject_name in subject_specialization_map:
        return subject_specialization_map[subject_name]

    # 3. Call AI ON DEMAND
    print(f"AI CALLED for subject: {subject_name}")

    ai_result = get_ai_specialization(subject_name)

    if not ai_result:
        print(f"AI failed for {subject_name}, using fallback")
        return ["Information Technology (General Elective)"]  # Backup fallback


    parsed = [s.strip() for s in ai_result.split(",") if s.strip()]

    subject_specialization_map[subject_name] = parsed

    return parsed

# ===== Time slots =====
hours = [(7,9), (9,11), (13,15), (15,17), (17,19)]
days = ["Mon","Tue","Wed","Thu","Fri","Sat"]
time_slots = [(d,h[0],h[1]) for d in days for h in hours]

# ===== GA Progress =====
ga_progress = {"current":0, "total":0, "running":False, "result":[]}

# ===== Helper Functions =====
def get_day(slot):
    try:
        return slot.split(":")[0].strip()
    except:
        return ""

def is_eligible(prof, subject_name, load, slot_key):
    # 1. Load check
    if load >= prof["absolute_max_units"]:
        return False

    # 2. Availability check
    if slot_key and get_day(slot_key) not in prof["availability"]:
        return False

    # 3. Specialization matching (NEW SYSTEM)
    required_specs = get_specialization(subject_name)

    # If elective → allow anyone
    if subject_name.startswith("IT Elective"):
        return True

    prof_specs = set(s.strip().lower() for s in prof["specialization"])
    required_specs = set(s.strip().lower() for s in required_specs)

    if prof_specs & required_specs:
        return True

    return False



# ===== GA Functions =====
def greedy_schedule(faculty, subjects):
    schedule = []
    faculty_load = {f["name"]:0 for f in faculty}
    faculty_slots = {f["name"]:set() for f in faculty}

    sorted_subjects = sorted(subjects, key=lambda x: -x["hours"])

    for subj in sorted_subjects:
        hours_remaining = subj["hours"]
        attempts = 0

        while hours_remaining > 0 and attempts < 50:
            attempts += 1

            eligible = [
                f for f in faculty
                if is_eligible(f, subj["name"], faculty_load[f["name"]], None)
                and can_take_more(f, faculty_load[f["name"]])
            ]

            if not eligible:
                required_specs = get_specialization(subj["name"])
                eligible = sorted(
                    faculty,
                    key=lambda f: len(set(f["specialization"]) & set(required_specs)),
                    reverse=True
                )

            if not eligible:
                break

            eligible.sort(key=lambda x: faculty_load[x["name"]])
            chosen_prof = eligible[0]

            free_slots = [
                f"{slot[0]}: {slot[1]}-{slot[2]}"
                for slot in time_slots
                if f"{slot[0]}: {slot[1]}-{slot[2]}" not in faculty_slots[chosen_prof["name"]]
                and get_day(f"{slot[0]}: {slot[1]}-{slot[2]}") in chosen_prof["availability"]
            ]

            if not free_slots:
                break  # 🔥 FIXED

            slot_key = random.choice(free_slots)

            schedule.append({
                "faculty": chosen_prof["name"],
                "subject": subj["name"],
                "type": subj["type"],
                "slot": slot_key
            })

            faculty_load[chosen_prof["name"]] += 1
            faculty_slots[chosen_prof["name"]].add(slot_key)
            hours_remaining -= 1

    return schedule

def fitness(schedule, faculty):
    score = 0
    faculty_load = {f["name"]:0 for f in faculty}
    specialization_score = 0
    slot_conflicts = 0
    load_penalty = 0
    overload_penalty = 0

    for item in schedule:
        f_name = item["faculty"]
        faculty_load[f_name] += 1

        required_specs = get_specialization(item["subject"])
        prof_specs = set(s.strip().lower() for s in next(f for f in faculty if f["name"]==f_name)["specialization"])

        # Structured match score (normalized)
        match_score = len([rs for rs in required_specs if any(rs.lower() in ps or ps in rs.lower() for ps in prof_specs)])
        if required_specs:
            specialization_score += match_score / len(required_specs)
        else:
            specialization_score += 1  # neutral

        # slot conflicts
        same_slot_count = sum(1 for i in schedule if i["faculty"]==f_name and i["slot"]==item["slot"])
        if same_slot_count > 1:
            slot_conflicts += 1

    # Normalize components
    max_load = max(faculty_load.values()) if faculty_load else 1
    loads = list(faculty_load.values())
    mean_load = sum(loads) / len(loads)
    load_variance = sum((l - mean_load) ** 2 for l in loads) / len(loads)

    # Penalty scaling
    for f in faculty:
        load_penalty += max(0, faculty_load[f["name"]] - f["absolute_max_units"])

    for f in faculty:
        if faculty_load[f["name"]] > f["absolute_max_units"]:
            overload_penalty += (faculty_load[f["name"]] - f["absolute_max_units"]) * 10
    
    score -= overload_penalty

    # Final weighted score (normalized)
    score = (
        0.5 * (specialization_score / len(schedule) if schedule else 0) +
        0.2 * (1 - slot_conflicts / (len(schedule)+1)) +
        0.2 * (1 - load_variance) +
        0.1 * (1 - load_penalty / (len(schedule)+1))
    )

    return score

def repair(schedule, faculty):
    faculty_load = {f["name"]:0 for f in faculty}
    faculty_slots = {f["name"]:set() for f in faculty}

    for item in schedule:
        f_name = item["faculty"]
        slot = item["slot"]

        # ✅ ALWAYS define prof_obj first
        prof_obj = next((f for f in faculty if f["name"] == f_name), None)
        if prof_obj is None:
            continue

        # ✅ ALWAYS define new_prof (default = current professor)
        new_prof = prof_obj

        # If current assignment is invalid → find replacement
        if (
            slot in faculty_slots[f_name]
            or faculty_load[f_name] >= prof_obj["absolute_max_units"]
            or get_day(slot) not in prof_obj["availability"]
        ):
            eligible = [
                p for p in faculty
                if is_eligible(p, item["subject"], faculty_load[p["name"]], None)
            ]

            if not eligible:
                continue  # skip instead of forcing bad assignment

            eligible.sort(
                key=lambda p: (
                    -len(set(p["specialization"]) & set(get_specialization(item["subject"]))),
                    faculty_load[p["name"]]
                )
            )

            new_prof = eligible[0]

            free_slots = [
                f"{s[0]}: {s[1]}-{s[2]}"
                for s in time_slots
                if f"{s[0]}: {s[1]}-{s[2]}" not in faculty_slots[new_prof["name"]]
                and get_day(f"{s[0]}: {s[1]}-{s[2]}") in new_prof["availability"]
            ]

            item["faculty"] = new_prof["name"]

            if free_slots:
                item["slot"] = free_slots[0]

        # ✅ SAFE: new_prof is ALWAYS defined now
        if faculty_load[item["faculty"]] >= new_prof["absolute_max_units"]:
            continue

        faculty_load[item["faculty"]] += 1
        faculty_slots[item["faculty"]].add(item["slot"])

    return schedule

def mutate(schedule, faculty, mut_rate=0.1):

    current_fitness = fitness(schedule, faculty)

    for item in schedule:
        # Adaptive mutation: worse solution = higher mutation chance
        adaptive_rate = mut_rate * (1 - min(max(current_fitness, 0), 1))

        if random.random() < adaptive_rate:
            eligible = [
                f for f in faculty
                if f["name"] != item["faculty"]
                and is_eligible(f, item["subject"], 0, None)
                and can_take_more(f, 1)
            ]

            if not eligible:
                continue

            eligible.sort(key=lambda f: (
                -len(set(f["specialization"]) & set(get_specialization(item["subject"]))),
                f["absolute_max_units"]
            ))

            new_prof = eligible[0]
            item["faculty"] = new_prof["name"]

            # Assign slot more intelligently
            free_slots = [
                f"{s[0]}: {s[1]}-{s[2]}"
                for s in time_slots
                if get_day(f"{s[0]}: {s[1]}-{s[2]}") in new_prof["availability"]
            ]

            if free_slots:
                item["slot"] = random.choice(free_slots)

    return schedule

def crossover(parent1, parent2, faculty):
    child = []

    for i in range(len(parent1)):
        gene1 = parent1[i]
        gene2 = parent2[i]

        # Prefer better fitness gene locally
        f1 = fitness([gene1], faculty)
        f2 = fitness([gene2], faculty)

        if f1 > f2:
            child.append(copy.deepcopy(gene1))
        else:
            child.append(copy.deepcopy(gene2))

    return repair(child, faculty)

def balance_workload(population, faculty):
    for schedule in population:
        # Calculate load per faculty
        faculty_load = {f["name"]:0 for f in faculty}
        for item in schedule:
            faculty_load[item["faculty"]] += 1

        max_load = max(faculty_load.values())
        min_load = min(faculty_load.values())
        iteration = 0

        # Continue balancing until difference <=1 or max 10 iterations
        while max_load - min_load > 1 and iteration < 10:
            high_profs = [f for f,l in faculty_load.items() if l == max_load]
            low_profs = [f for f,l in faculty_load.items() if l == min_load]

            for high in high_profs:
                for low in low_profs:
                    # Find candidates taught by high-load prof
                    candidates = [i for i in schedule if i["faculty"] == high]
                    for c in candidates:
                        prof_obj = next(x for x in faculty if x["name"] == low)
                        if is_eligible(prof_obj, c["subject"], faculty_load[low], None):
                            c["faculty"] = low
                            faculty_load[high] -= 1
                            faculty_load[low] += 1
                            break
            max_load = max(faculty_load.values())
            min_load = min(faculty_load.values())
            iteration += 1

def tournament_selection(population, faculty, k=5):
    selected = random.sample(population, k)
    selected.sort(key=lambda x: fitness(x, faculty), reverse=True)
    return selected[0]

def can_take_more(prof, faculty_load):
    return faculty_load < prof["absolute_max_units"]

def preload_ai_cache(subjects):
    for subj in subjects:
        name = subj["name"]

        if name in specialization_mapping:
            continue

        if name in subject_specialization_map:
            continue

        ai_result = get_ai_specialization(name)

        if not ai_result:
            print(f"AI failed for {name}, skipping cache")
            continue

        parsed = [s.strip() for s in ai_result.split(",") if s.strip()]

        if parsed:
            subject_specialization_map[name] = parsed

        time.sleep(0.2)  # PREVENT SPAM / FREEZE


def run_ga(faculty, subjects, pop_size=20, num_generations=50, mut_rate=0.1, cross_rate=0.8):
    
    global ga_progress
    print("Thread is running...")
    with ga_lock:
        ga_progress["current"] = 0
        ga_progress["total"] = num_generations
        ga_progress["running"] = True

        # ===== Population Initialization: Greedy + Diversity =====
        population = []

        for _ in range(pop_size):
            if random.random() < 0.5:
                population.append(greedy_schedule(faculty, subjects))
            else:
                random_sched = mutate(copy.deepcopy(greedy_schedule(faculty, subjects)), faculty, mut_rate=0.3)
                population.append(random_sched)

        best_fitness_history = []
        no_improvement_count = 0

        for gen in range(1, num_generations + 1):

            ga_progress["current"] = gen
            print(f"Generation: {gen}")

            # ===== Sort by fitness (descending) =====
            population = sorted(population, key=lambda x: fitness(x, faculty), reverse=True)

            best_fitness = fitness(population[0], faculty)

            print(f"Generation {gen}/{num_generations} | Best fitness: {best_fitness}")

            best_fitness_history.append(best_fitness)

            if len(best_fitness_history) > 5:
                if max(best_fitness_history[-5:]) == min(best_fitness_history[-5:]):
                    no_improvement_count += 1
                else:
                    no_improvement_count = 0

            if no_improvement_count >= 10:
                print("Early stopping due to convergence")
                break

            # ===== Elitism: Keep top 2 schedules =====
            elite_size = max(3, pop_size // 5)
            next_gen = population[:elite_size]

            
            attempts = 0
            # ===== Generate rest of the next generation =====
            while len(next_gen) < pop_size and attempts < 1000:
                
                attempts += 1
                # Select parents from top half
                p1 = tournament_selection(population, faculty)
                p2 = tournament_selection(population, faculty)

                # Crossover
                if random.random() < cross_rate:
                    child = crossover(p1, p2, faculty)
                else:
                    child = copy.deepcopy(p1)

                # Mutation (smarter)
                child = mutate(child, faculty, mut_rate)

                # Add to next generation
                next_gen.append(child)

            population = next_gen

            # Optional: balance workload (extra safety, not strictly needed)
            balance_workload(population, faculty)

            # ===== Update progress for API =====
            ga_progress["current"] = gen
            best_current = sorted(population, key=lambda x: fitness(x, faculty), reverse=True)[0]
            ga_progress["result"] = best_current

        ga_progress["current"] = num_generations
        ga_progress["running"] = False

        # ===== Done =====
        ga_progress["result"] = sorted(population, key=lambda x: fitness(x, faculty), reverse=True)[0]
        ga_progress["running"] = False

        print("GA completed. Best schedule fitness:", fitness(ga_progress["result"], faculty))
        return ga_progress["result"]

# ===== API Endpoints =====
@app.route("/run-ga", methods=["POST"])

def run_ga_api():
    data = request.get_json()

    # === Get faculty from frontend ===
    faculty = data.get("faculty", [])
    subjects = data.get("subjects", [])

    # Ensure subjects have required fields
    formatted_subjects = []
    for subj in subjects:
        name = subj.get("name")
        typ = subj.get("type", "Software")
        hours = int(subj.get("hours", 2))

        if name:
            formatted_subjects.append({
                "name": name,
                "type": typ,
                "hours": hours
            })

    subjects = formatted_subjects

    # === GA parameters from frontend (optional) ===
    population_size = int(data.get("population", 20))
    generations = int(data.get("generations", 50))
    mutation_rate = float(data.get("mutation", 0.1))
    crossover_rate = min(max(float(data.get("crossover", 0.8)), 0), 1)


    def safe_run_ga(*args):
        try:
            run_ga(*args)
        except Exception as e:
            print("Algorithm CRASHED:", str(e))

    preload_ai_cache(subjects)

    # Run GA in background
    thread = threading.Thread(
        target=safe_run_ga,
        args=(faculty, subjects, population_size, generations, mutation_rate, crossover_rate),
        daemon=True
    )
    thread.start()
    print("Algorithm Started")
    print("Faculty count:", len(faculty))
    print("Incoming faculty:", faculty)
    print("Ollama cache used:", subject_specialization_map)


    return jsonify({"status": "started"})


@app.route("/progress")
def get_progress():
    return jsonify(ga_progress)

if __name__ == "__main__":
    app.run(debug=True, use_reloader=False)

