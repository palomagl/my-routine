import { useState, useEffect } from "react";
import { useAcaoUnica } from "@/hooks/useAcaoUnica";
import { Droplet, Dumbbell, BookOpen, Moon, Coffee, Leaf, Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { habitsApi, Habit as ApiHabit } from "@/lib/db";
import { executar, carregar } from "@/lib/acoes";
import { useLocale } from "@/contexts/LocaleContext";

const iconMap: Record<string, React.ElementType> = {
  Droplet, Dumbbell, BookOpen, Moon, Coffee, Leaf,
};
const iconOptions = ["Droplet", "Dumbbell", "BookOpen", "Moon", "Coffee", "Leaf"];

export function HabitsWidget() {
  const { t } = useLocale();
  const [habits, setHabits] = useState<ApiHabit[]>([]);
  const [showAddForm, setShowAddForm] = useState(false);
  const [newName, setNewName] = useState("");
  const [newIcon, setNewIcon] = useState("Leaf");

  useEffect(() => {
    carregar(() => habitsApi.list(), "hábitos").then((lista) => lista && setHabits(lista));
  }, []);

  const toggleHabit = async (id: string) => {
    const atualizado = await executar(() => habitsApi.toggle(id), { erro: t("erroAoSalvar") });
    if (!atualizado) return;
    setHabits(habits.map(h => h.id === id ? atualizado : h));
  };

  // Uma criação por vez: Enter repetido ou toque duplo criava hábitos iguais.
  const { disparar: addHabit, ocupado: adicionando } = useAcaoUnica(async () => {
    if (!newName.trim()) return;
    const habit = await executar(
      () => habitsApi.create({ name: newName.trim(), icon: newIcon, completed: false, streak: 0 }),
      { erro: t("erroAoAdicionar") }
    );
    if (!habit) return;
    setHabits([...habits, habit]);
    setNewName("");
    setNewIcon("Leaf");
    setShowAddForm(false);
  });

  const completedCount = habits.filter(h => h.completed).length;

  return (
    <div className="glass-card glass-card-hover rounded-xl p-5 animate-fade-in" style={{ animationDelay: "100ms" }}>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="font-semibold text-lg flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-widget-habits" />
            {t("habitsTitle")}
          </h3>
          <p className="text-sm text-muted-foreground">
            {completedCount} {t("tasksOf")} {habits.length} {t("habitsTodayCount")}
          </p>
        </div>
        <Button type="button" variant="ghost" size="icon" onClick={() => setShowAddForm(!showAddForm)} aria-label={showAddForm ? t("close") : t("habitsAdd")}>
          {showAddForm ? <X className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
        </Button>
      </div>

      {showAddForm && (
        <div className="space-y-2 mb-4 p-3 bg-secondary/30 rounded-lg animate-fade-in">
          <Input
            placeholder={t("habitsPlaceholder")}
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && addHabit()}
            className="bg-background/50 border-border/50"
            autoFocus
          />
          <div className="flex gap-2 flex-wrap">
            {iconOptions.map((iconKey) => {
              const Icon = iconMap[iconKey];
              return (
                <button
                  type="button"
                  key={iconKey}
                  onClick={() => setNewIcon(iconKey)}
                  className={`p-2 rounded-lg transition-all ${newIcon === iconKey ? "bg-widget-habits text-white" : "bg-background/50 hover:bg-secondary"}`}
                  aria-label={`Ícone ${iconKey}`}
                >
                  {Icon && <Icon className="w-4 h-4" />}
                </button>
              );
            })}
          </div>
          <Button type="button" onClick={() => addHabit()} disabled={adicionando} size="sm" className="w-full bg-widget-habits hover:bg-widget-habits/90">
            {t("habitsAdd")}
          </Button>
        </div>
      )}

      {habits.length === 0 && !showAddForm ? (
        <div className="text-center py-8 text-muted-foreground text-sm">
          {t("habitsEmpty")}
        </div>
      ) : habits.length > 0 ? (
        <div className="grid grid-cols-3 gap-3">
          {habits.map((habit) => {
            const Icon = iconMap[habit.icon] || Leaf;
            return (
              <button
                type="button"
                key={habit.id}
                onClick={() => toggleHabit(habit.id)}
                className={`flex flex-col items-center gap-2 p-4 rounded-xl transition-all duration-200
                  ${habit.completed 
                    ? 'bg-widget-habits/20 border-2 border-widget-habits' 
                    : 'bg-secondary/50 border-2 border-transparent hover:border-widget-habits/30'
                  }`}
              >
                <Icon className={`w-6 h-6 ${habit.completed ? 'text-widget-habits' : 'text-muted-foreground'}`} />
                <span className="text-xs text-center font-medium">{habit.name}</span>
                <span className="text-[10px] text-muted-foreground">🔥 {habit.streak}</span>
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
